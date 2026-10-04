#!/usr/bin/env python3
"""Verify an archive by restoring it into a disposable local Supabase database.

Only Docker's isolated test container is targeted; no production connection is
accepted. Sensitive dump content and psql errors are never printed.
"""
import argparse
import re
from pathlib import Path
import subprocess
import tempfile
import uuid
from restore_public import read_archive, load_snapshot, render_sql, TABLE_ORDER


def run(command, **options):
    result = subprocess.run(command, capture_output=True, **options)
    if result.returncode:
        # SQL error output can contain personal data from COPY or query text.
        error = result.stderr.decode(errors='replace') if isinstance(result.stderr, bytes) else result.stderr
        codes = re.findall(r'ERROR:\s+([A-Z0-9]{5})(?:\s|$)', error or '')
        diagnostic = ' (SQLSTATE ' + ', '.join(codes) + ')' if codes else ''
        raise RuntimeError('Isolated backup restore failed: ' + command[0] + diagnostic)
    return result


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
        container = 'supabase_db_' + project
        try:
            run(['supabase', 'db', 'start', '--workdir', directory])
            # Supabase manages Auth/Storage schemas itself. The archive restores
            # custom schema and data onto the matching local platform baseline.
            sql = files['roles.sql'] + b'\n' + files['schema.sql'] + b'\nSET session_replication_role = replica;\n' + files['data.sql'] + b'\nSET session_replication_role = origin;\n'
            print('Restoring archived roles, schema and data...', flush=True)
            run(['docker', 'exec', '-i', container, 'psql', '-U', 'supabase_admin', '-X', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '--single-transaction'], input=sql)
            # Exercise the same public-data recovery transaction used in an incident.
            print('Testing public-data recovery...', flush=True)
            run(['docker', 'exec', '-i', container, 'psql', '-U', 'supabase_admin', '-X', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '--single-transaction'], input=render_sql(snapshot, 'full').encode())
            for table in TABLE_ORDER:
                result = run(['docker', 'exec', '-i', container, 'psql', '-U', 'supabase_admin', '-At', '-c', f'SELECT count(*) FROM public."{table}";'])
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
