#!/usr/bin/env python3
"""Verify an archive by restoring it into a disposable local Supabase database.

Only Docker's isolated test container is targeted; no production connection is
accepted. Only SQLSTATE, source locations and simple relation identifiers from
psql errors are reported; dump content and raw errors are never printed.
"""
import argparse
import re
from pathlib import Path
import subprocess
import tempfile
import uuid
from restore_public import read_archive, load_snapshot, render_sql, TABLE_ORDER


# CLI 2.119.0 bundles Storage v1.79.28, which predates the hosted lifecycle
# state tables. Let the CLI apply the official migrations from this pinned
# version instead of inventing tables or excluding their data from the test.
STORAGE_VERSION = 'v1.90.0'


def run(command, *, sources=(), **options):
    result = subprocess.run(command, capture_output=True, **options)
    if result.returncode:
        # SQL error output can contain personal data from COPY or query text.
        error = result.stderr.decode(errors='replace') if isinstance(result.stderr, bytes) else result.stderr
        diagnostics = []
        for line in (error or '').splitlines():
            match = re.search(r'ERROR:\s+([A-Z0-9]{5})(?::|\s|$)', line)
            if not match:
                continue
            code = match.group(1)
            diagnostics.append('SQLSTATE ' + code)
            location = re.match(r'psql:<stdin>:(\d+):', line)
            if location:
                number = int(location.group(1))
                for name, start, end in sources:
                    if start <= number <= end:
                        diagnostics.append(f'{name}:{number - start + 1}')
                        break
            # Never log DETAIL, CONTEXT, query text, COPY rows or arbitrary
            # messages. Accept only PostgreSQL's missing-relation message and
            # simple identifiers (no whitespace, quotes or control characters).
            if code == '42P01':
                relation = re.fullmatch(
                    r'\s*relation "([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)" does not exist\s*',
                    line[match.end():],
                )
                if relation:
                    diagnostics.append('missing relation ' + relation.group(1))
        diagnostic = ' (' + '; '.join(diagnostics) + ')' if diagnostics else ''
        raise RuntimeError('Isolated backup restore failed: ' + command[0] + diagnostic)
    return result


def run_sql(container, sections):
    """Keep one transaction, while mapping psql line numbers to archive files."""
    chunks = []
    sources = []
    start = 1
    for name, content in sections:
        chunk = content + b'\n'
        end = start + chunk.count(b'\n') - 1
        chunks.append(chunk)
        sources.append((name, start, end))
        start = end + 1
    return run(
        ['docker', 'exec', '-i', container, 'psql', '-U', 'supabase_admin',
         '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-v',
         'VERBOSITY=verbose', '--single-transaction', '--file=-'],
        input=b''.join(chunks), sources=sources,
    )


def verify(archive):
    files = read_archive(archive)
    snapshot = load_snapshot(archive)
    with tempfile.TemporaryDirectory(prefix='odar-backup-verify-') as directory:
        root = Path(directory)
        config = root / 'supabase'
        config.mkdir()
        project = 'odar-backup-test-' + uuid.uuid4().hex[:10]
        # Let the OS pick an unused host port for local tests and CI.
        import socket
        with socket.socket() as port_socket:
            port_socket.bind(('127.0.0.1', 0))
            port = port_socket.getsockname()[1]
        (config / 'config.toml').write_text(f'project_id = "{project}"\n[db]\nport = {port}\nmajor_version = 17\n')
        # The same service-version pin that `supabase link` writes, scoped to
        # this disposable project. No production credentials or link is used.
        pins = config / '.temp'
        pins.mkdir()
        (pins / 'storage-version').write_text(STORAGE_VERSION + '\n')
        container = 'supabase_db_' + project
        try:
            print(f'Preparing isolated database with Storage {STORAGE_VERSION}...', flush=True)
            run(['supabase', 'db', 'start', '--workdir', directory])
            # Supabase manages Auth/Storage schemas itself. The archive restores
            # custom schema and data onto the matching local platform baseline.
            print('Restoring archived roles, schema and data...', flush=True)
            run_sql(container, [
                ('roles.sql', files['roles.sql']),
                ('schema.sql', files['schema.sql']),
                ('restore-settings', b'SET session_replication_role = replica;'),
                ('data.sql', files['data.sql']),
                ('restore-settings', b'SET session_replication_role = origin;'),
            ])
            # Exercise the same public-data recovery transaction used in an incident.
            print('Testing public-data recovery...', flush=True)
            run_sql(container, [('public-recovery.sql', render_sql(snapshot, 'full').encode())])
            for table in TABLE_ORDER:
                result = run(['docker', 'exec', '-i', container, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-At', '-c', f'SELECT count(*) FROM public."{table}";'])
                if int(result.stdout.strip()) != snapshot.blocks[table].count:
                    raise RuntimeError('Restored row count differs: ' + table)
            print('Isolated schema/data restore and public recovery transaction passed.')
        finally:
            subprocess.run(['supabase', 'stop', '--workdir', directory, '--no-backup'], capture_output=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('archive', type=Path)
    args = parser.parse_args()
    try:
        verify(args.archive)
    except RuntimeError as error:
        raise SystemExit(str(error))
    except Exception:
        raise SystemExit('Backup restore verification failed. Production was not modified.')
