#!/usr/bin/env python3
"""Prepare or apply an in-place restore of Odar's public data only.

This deliberately leaves Supabase Auth, Storage, Edge Functions, roles, and
schema untouched. Use the full database dump for other recovery scenarios.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import subprocess
import sys
import tarfile
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse


PROJECT_REF = "mzibphdvuyemehboxown"
TABLE_ORDER = (
    "profiles",
    "wells",
    "water_years",
    "well_farmers",
    "water_allocations",
    "water_usages",
    "well_expenses",
)
IGNORED_PUBLIC_TABLES = {"admin_otp_codes"}  # One-time codes must not be replayed.
MAX_MEMBER_BYTES = 512 * 1024 * 1024
COPY_HEADER = re.compile(
    r'^COPY "(?P<schema>[a-z_]+)"\."(?P<table>[a-z_]+)" '
    r'\((?P<columns>"[a-z_]+"(?:, "[a-z_]+")*)\) FROM stdin;$'
)


class RestoreError(Exception):
    pass


@dataclass(frozen=True)
class CopyBlock:
    table: str
    columns: tuple[str, ...]
    lines: tuple[str, ...]
    ids: frozenset[uuid.UUID]

    @property
    def count(self) -> int:
        return len(self.lines)


@dataclass(frozen=True)
class Snapshot:
    blocks: dict[str, CopyBlock]
    admin_id: uuid.UUID
    auth_ids: frozenset[uuid.UUID]


def read_archive(path: Path) -> dict[str, bytes]:
    required = {"roles.sql", "schema.sql", "data.sql", "SHA256SUMS"}
    try:
        with tarfile.open(path, "r:*") as archive:
            members = archive.getmembers()
            if {item.name for item in members} != required:
                raise RestoreError("Archive entries differ from the expected backup files")
            if any(not item.isfile() or item.size > MAX_MEMBER_BYTES for item in members):
                raise RestoreError("Archive contains an unsupported or oversized entry")
            files = {item.name: archive.extractfile(item).read() for item in members}
    except (OSError, tarfile.TarError) as exc:
        raise RestoreError(f"Cannot read backup archive: {exc}") from exc

    expected = {}
    try:
        for line in files["SHA256SUMS"].decode("ascii").splitlines():
            digest, name = line.split(maxsplit=1)
            if not re.fullmatch(r"[a-f0-9]{64}", digest) or name in expected:
                raise ValueError("invalid checksum line")
            expected[name] = digest
    except (UnicodeError, ValueError) as exc:
        raise RestoreError("Invalid SHA256SUMS file") from exc
    if set(expected) != required - {"SHA256SUMS"}:
        raise RestoreError("SHA256SUMS does not cover every SQL file")
    for name, digest in expected.items():
        if hashlib.sha256(files[name]).hexdigest() != digest:
            raise RestoreError(f"Checksum mismatch: {name}")
    return files


def parse_blocks(data: bytes) -> dict[str, CopyBlock]:
    try:
        lines = data.decode("utf-8").splitlines()
    except UnicodeError as exc:
        raise RestoreError("data.sql is not UTF-8") from exc
    blocks: dict[str, CopyBlock] = {}
    index = 0
    while index < len(lines):
        header = COPY_HEADER.fullmatch(lines[index])
        if not header:
            index += 1
            continue
        schema = header.group("schema")
        table = header.group("table")
        columns = tuple(part.strip('"') for part in header.group("columns").split(", "))
        index += 1
        rows: list[str] = []
        while index < len(lines) and lines[index] != r"\.":
            if lines[index].startswith("COPY "):
                raise RestoreError(f"Unterminated COPY block: {schema}.{table}")
            if len(lines[index].split("\t")) != len(columns):
                raise RestoreError(f"Wrong column count in COPY block: {schema}.{table}")
            rows.append(lines[index])
            index += 1
        if index == len(lines):
            raise RestoreError(f"Unterminated COPY block: {schema}.{table}")
        index += 1
        if schema != "public":
            if schema == "auth" and table == "users":
                if "auth.users" in blocks:
                    raise RestoreError("Repeated auth.users COPY block")
                # Capture Auth IDs without copying Auth data back to the live project.
                blocks["auth.users"] = make_block("auth.users", columns, rows)
            continue
        if table in IGNORED_PUBLIC_TABLES:
            continue
        if table not in TABLE_ORDER or table in blocks:
            raise RestoreError(f"Unexpected or repeated public COPY block: {table}")
        blocks[table] = make_block(table, columns, rows)
    if set(blocks) != set(TABLE_ORDER) | {"auth.users"}:
        raise RestoreError("Backup is missing a required public table or auth.users")
    return blocks


def make_block(table: str, columns: tuple[str, ...], rows: list[str]) -> CopyBlock:
    if "id" not in columns:
        raise RestoreError(f"COPY block has no ID column: {table}")
    position = columns.index("id")
    try:
        ids = frozenset(uuid.UUID(row.split("\t")[position]) for row in rows)
    except ValueError as exc:
        raise RestoreError(f"Invalid ID in COPY block: {table}") from exc
    if len(ids) != len(rows):
        raise RestoreError(f"Repeated ID in COPY block: {table}")
    return CopyBlock(table, columns, tuple(rows), ids)


def load_snapshot(path: Path) -> Snapshot:
    files = read_archive(path)
    blocks = parse_blocks(files["data.sql"])
    profiles = blocks["profiles"]
    if "role" not in profiles.columns or "is_active" not in profiles.columns:
        raise RestoreError("profiles COPY block lacks role or is_active")
    role_position = profiles.columns.index("role")
    active_position = profiles.columns.index("is_active")
    id_position = profiles.columns.index("id")
    admins = [row.split("\t") for row in profiles.lines if row.split("\t")[role_position] == "admin"]
    if len(admins) != 1 or admins[0][active_position] not in ("t", "true"):
        raise RestoreError("Backup must contain exactly one active admin profile")
    admin_id = uuid.UUID(admins[0][id_position])
    auth_ids = blocks["auth.users"].ids
    if admin_id not in auth_ids or not profiles.ids.issubset(auth_ids):
        raise RestoreError("Backup profiles do not match Auth users")
    return Snapshot(blocks, admin_id, auth_ids)


def render_sql(snapshot: Snapshot, mode: str) -> str:
    if mode not in ("missing", "full"):
        raise RestoreError("Unsupported restore mode")
    sql = [
        "-- Generated by scripts/restore_public.py. Contains sensitive backup data.",
        "SET LOCAL lock_timeout = '10s';",
        "SET LOCAL statement_timeout = '15min';",
    ]
    for table in TABLE_ORDER:
        block = snapshot.blocks[table]
        columns = ", ".join(f'"{column}"' for column in block.columns)
        sql += [
            f'CREATE TEMP TABLE "odar_restore_{table}" (LIKE public."{table}");',
            f'COPY pg_temp."odar_restore_{table}" ({columns}) FROM stdin;',
            *block.lines,
            r"\.",
        ]
    sql += [
        "LOCK TABLE " + ", ".join(f'public."{table}"' for table in TABLE_ORDER) + " IN ACCESS EXCLUSIVE MODE;",
        "DO $preflight$",
        "BEGIN",
        f"  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '{snapshot.admin_id}'::uuid) THEN",
        "    RAISE EXCEPTION 'Admin Auth user is missing';",
        "  END IF;",
        "  IF EXISTS (SELECT 1 FROM pg_temp.odar_restore_profiles p LEFT JOIN auth.users u ON u.id = p.id WHERE u.id IS NULL) THEN",
        "    RAISE EXCEPTION 'A backup profile has no Auth user in the target project';",
        "  END IF;",
        "  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass AND tgname = 'trg_link_profile_to_auth_user' AND tgenabled = 'O')",
        "     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.water_usages'::regclass AND tgname = 'trg_check_water_usage_quota' AND tgenabled = 'O') THEN",
        "    RAISE EXCEPTION 'Expected public triggers are missing or disabled';",
        "  END IF;",
    ]
    if mode == "full":
        sql += [
            "  IF EXISTS (SELECT id FROM auth.users EXCEPT SELECT id FROM pg_temp.odar_restore_profiles)",
            "     OR EXISTS (SELECT id FROM pg_temp.odar_restore_profiles EXCEPT SELECT id FROM auth.users) THEN",
            "    RAISE EXCEPTION 'Auth user roster differs from the backup; full restore stopped';",
            "  END IF;",
        ]
    sql += ["END", "$preflight$;", "ALTER TABLE public.profiles DISABLE TRIGGER trg_link_profile_to_auth_user;", "ALTER TABLE public.water_usages DISABLE TRIGGER trg_check_water_usage_quota;"]
    if mode == "full":
        sql.append("TRUNCATE TABLE " + ", ".join(f'public."{table}"' for table in reversed(TABLE_ORDER)) + ";")
    for table in TABLE_ORDER:
        block = snapshot.blocks[table]
        columns = ", ".join(f'"{column}"' for column in block.columns)
        statement = (
            f'INSERT INTO public."{table}" ({columns}) '
            f'SELECT {columns} FROM pg_temp."odar_restore_{table}" WHERE true'
        )
        if mode == "missing":
            statement += " ON CONFLICT (id) DO NOTHING"
        sql.append(statement + ";")
    sql += [
        "ALTER TABLE public.profiles ENABLE TRIGGER trg_link_profile_to_auth_user;",
        "ALTER TABLE public.water_usages ENABLE TRIGGER trg_check_water_usage_quota;",
        "DO $verify$",
        "BEGIN",
        f"  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = '{snapshot.admin_id}'::uuid AND role = 'admin' AND is_active) THEN",
        "    RAISE EXCEPTION 'Admin profile verification failed';",
        "  END IF;",
    ]
    for table in TABLE_ORDER:
        sql += [
            f'  IF EXISTS (SELECT id FROM pg_temp."odar_restore_{table}" EXCEPT SELECT id FROM public."{table}") THEN',
            f"    RAISE EXCEPTION 'Snapshot IDs missing after restore: {table}';",
            "  END IF;",
        ]
        if mode == "full":
            sql += [
                f'  IF (SELECT count(*) FROM public."{table}") <> {snapshot.blocks[table].count} THEN',
                f"    RAISE EXCEPTION 'Row count differs after full restore: {table}';",
                "  END IF;",
            ]
    sql += ["END", "$verify$;", ""]
    return "\n".join(sql)


def database_environment() -> dict[str, str]:
    url = os.environ.get("ODAR_RESTORE_DB_URL", "")
    parsed = urlparse(url)
    username = unquote(parsed.username or "")
    hostname = parsed.hostname or ""
    direct = hostname == f"db.{PROJECT_REF}.supabase.co" and username == "postgres"
    pooler = hostname.endswith(".pooler.supabase.com") and username == f"postgres.{PROJECT_REF}"
    if parsed.scheme not in ("postgres", "postgresql") or not (direct or pooler):
        raise RestoreError("ODAR_RESTORE_DB_URL does not identify the Odar project")
    env = os.environ.copy()
    env["PGDATABASE"] = url
    env["PGCONNECT_TIMEOUT"] = "10"
    return env


def apply(snapshot: Snapshot, mode: str, emergency_dir: Path) -> None:
    env = database_environment()
    if not emergency_dir.is_absolute():
        raise RestoreError("--emergency-dir must be an absolute path outside the repository")
    if emergency_dir.resolve().is_relative_to(Path(__file__).resolve().parents[1]):
        raise RestoreError("Emergency backups must not be written inside the repository")
    for command in ("psql", "pg_dump"):
        result = subprocess.run([command, "--version"], capture_output=True, text=True, check=False)
        version = re.search(r"\b(\d+)\.\d+\b", result.stdout)
        if result.returncode or not version or int(version.group(1)) < 17:
            raise RestoreError(f"{command} is required (PostgreSQL client 17 or newer)")
    emergency_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = emergency_dir / f"odar-public-before-restore-{stamp}.dump"
    print("Saving current public schema and data before restore...", flush=True)
    subprocess.run(
        ["pg_dump", "--format=custom", "--schema=public", "--no-owner", "--no-acl", f"--file={backup}"],
        env=env,
        check=True,
    )
    if not backup.is_file() or backup.stat().st_size == 0:
        raise RestoreError("Emergency backup is empty")
    sql_path = emergency_dir / f"odar-public-restore-{stamp}.sql"
    sql_path.write_text(render_sql(snapshot, mode), encoding="utf-8")
    sql_path.chmod(0o600)
    print(f"Emergency backup saved: {backup}", flush=True)
    print(f"Applying {mode} restore to the same Odar project...", flush=True)
    subprocess.run(["psql", "-X", "--single-transaction", "--set", "ON_ERROR_STOP=1", "--file", str(sql_path)], env=env, check=True)
    print("Restore committed after database checks.", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Inspect or restore Odar public data on the existing project")
    parser.add_argument("archive", type=Path, help="Supabase backup .tar.gz archive")
    parser.add_argument("--mode", choices=("missing", "full"), default="missing")
    parser.add_argument("--render", type=Path, help="Write restore SQL without connecting to Supabase")
    parser.add_argument("--apply", action="store_true", help="Apply restore to the existing Supabase project")
    parser.add_argument("--confirm-project-ref", help="Must equal the target project ref when using --apply")
    parser.add_argument("--emergency-dir", type=Path, help="Absolute directory for a backup of the current public schema and data")
    args = parser.parse_args()
    os.umask(0o077)
    try:
        snapshot = load_snapshot(args.archive)
        print(f"Backup verified: {snapshot.blocks['auth.users'].count} Auth users; " + ", ".join(f"{table}={snapshot.blocks[table].count}" for table in TABLE_ORDER))
        if args.render:
            if args.render.resolve().is_relative_to(Path(__file__).resolve().parents[1]):
                raise RestoreError("Sensitive restore SQL must not be written inside the repository")
            args.render.write_text(render_sql(snapshot, args.mode), encoding="utf-8")
            args.render.chmod(0o600)
            print(f"Sensitive restore SQL written to {args.render}")
        if args.apply:
            if args.confirm_project_ref != PROJECT_REF or not args.emergency_dir:
                raise RestoreError("--apply requires --confirm-project-ref and --emergency-dir")
            apply(snapshot, args.mode, args.emergency_dir)
        elif args.confirm_project_ref or args.emergency_dir:
            raise RestoreError("Connection arguments are only accepted with --apply")
    except (RestoreError, OSError, subprocess.CalledProcessError) as exc:
        print(f"Restore stopped: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
