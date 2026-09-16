"""Safety checks for the in-place public data restore tool."""

from __future__ import annotations

import hashlib
import io
import os
import sys
import tarfile
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import restore_public as recovery  # noqa: E402


ADMIN = str(uuid.UUID("10c85f6b-a65e-4fd6-812e-f631892c40af"))


def fixture_data(*, malformed: bool = False, admin_role: str = "admin") -> bytes:
    sections = [
        f'COPY "auth"."users" ("id") FROM stdin;\n{ADMIN}\n\\.',
        f'COPY "public"."profiles" ("id", "role", "is_active") FROM stdin;\n{ADMIN}\t{admin_role}\tt\n\\.',
    ]
    for table in recovery.TABLE_ORDER[1:]:
        row = f"{uuid.uuid4()}"
        if malformed and table == "wells":
            row += "\textra"
        sections.append(f'COPY "public"."{table}" ("id") FROM stdin;\n{row}\n\\.')
    sections.append(f'COPY "public"."admin_otp_codes" ("id") FROM stdin;\n{uuid.uuid4()}\n\\.')
    return ("\n\n".join(sections) + "\n").encode()


def make_archive(directory: Path, *, corrupt: bool = False, **data_options: object) -> Path:
    contents = {"roles.sql": b"-- roles\n", "schema.sql": b"-- schema\n", "data.sql": fixture_data(**data_options)}
    sums = "".join(f"{hashlib.sha256(value).hexdigest()}  {name}\n" for name, value in contents.items())
    contents["SHA256SUMS"] = sums.encode()
    if corrupt:
        contents["data.sql"] += b"-- altered after checksum\n"
    path = directory / "fixture.tar.gz"
    with tarfile.open(path, "w:gz") as archive:
        for name, value in contents.items():
            item = tarfile.TarInfo(name)
            item.size = len(value)
            archive.addfile(item, io.BytesIO(value))
    return path


class RestorePublicTests(unittest.TestCase):
    def test_missing_mode_never_writes_auth_or_replays_otp(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            snapshot = recovery.load_snapshot(make_archive(Path(directory)))
        sql = recovery.render_sql(snapshot, "missing")
        self.assertEqual(snapshot.admin_id, uuid.UUID(ADMIN))
        self.assertEqual(set(snapshot.blocks), set(recovery.TABLE_ORDER) | {"auth.users"})
        self.assertIn("ON CONFLICT (id) DO NOTHING", sql)
        self.assertNotIn("TRUNCATE TABLE", sql)
        self.assertNotIn("INSERT INTO auth.", sql)
        self.assertNotIn("admin_otp_codes", sql)
        self.assertIn("A backup profile has no Auth user", sql)

    def test_full_mode_checks_auth_roster_and_row_counts(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            snapshot = recovery.load_snapshot(make_archive(Path(directory)))
        sql = recovery.render_sql(snapshot, "full")
        self.assertIn("Auth user roster differs", sql)
        self.assertIn("TRUNCATE TABLE", sql)
        self.assertIn("Row count differs after full restore: wells", sql)
        self.assertNotIn("ON CONFLICT (id) DO NOTHING", sql)
        self.assertNotIn("TRUNCATE TABLE auth.", sql)

    def test_corrupted_checksum_stops_before_rendering(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(recovery.RestoreError, "Checksum mismatch"):
                recovery.load_snapshot(make_archive(Path(directory), corrupt=True))

    def test_invalid_copy_row_stops_before_rendering(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(recovery.RestoreError, "Wrong column count"):
                recovery.load_snapshot(make_archive(Path(directory), malformed=True))

    def test_archive_needs_one_active_admin(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(recovery.RestoreError, "one active admin"):
                recovery.load_snapshot(make_archive(Path(directory), admin_role="farmer"))

    def test_database_url_must_target_the_linked_project(self) -> None:
        with patch.dict(os.environ, {"ODAR_RESTORE_DB_URL": "postgresql://postgres.other:pw@db.other.supabase.co/postgres"}):
            with self.assertRaisesRegex(recovery.RestoreError, "does not identify"):
                recovery.database_environment()


if __name__ == "__main__":
    unittest.main()
