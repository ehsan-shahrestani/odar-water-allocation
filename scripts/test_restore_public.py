#!/usr/bin/env python3
"""Offline backup validation regressions; no real data or network calls."""
import hashlib
from pathlib import Path
import tempfile
import tarfile
import io
import re
import unittest
from restore_public import parse_blocks, read_archive, RestoreError, TABLE_ORDER, IGNORED_PUBLIC_TABLES

class RestoreTests(unittest.TestCase):
    def dump(self, extra=''):
        return (''.join(f'COPY "public"."{name}" ("id") FROM stdin;\n\\.\n' for name in TABLE_ORDER)
                + 'COPY "auth"."users" ("id") FROM stdin;\n\\.\n' + extra).encode()

    def test_current_security_tables_are_not_replayed(self):
        extra = ''.join(f'COPY "public"."{name}" ("id") FROM stdin;\nnot-a-real-id\n\\.\n' for name in ['admin_otp_codes', 'client_otp_codes', 'admin_mfa_sessions'])
        self.assertEqual(set(parse_blocks(self.dump(extra))), set(TABLE_ORDER) | {'auth.users'})

    def test_unknown_public_tables_fail_closed(self):
        with self.assertRaises(RestoreError):
            parse_blocks(self.dump('COPY "public"."unexpected" ("id") FROM stdin;\n\\.\n'))

    def test_tables_created_by_migrations_are_classified(self):
        migrations = Path(__file__).resolve().parents[1] / 'supabase' / 'migrations'
        tables = set()
        for migration in migrations.glob('*.sql'):
            tables.update(re.findall(
                r'\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-z_]+)',
                migration.read_text(encoding='utf-8'), re.IGNORECASE,
            ))
        self.assertTrue(tables)
        self.assertEqual(tables - set(TABLE_ORDER) - IGNORED_PUBLIC_TABLES, set())

    def test_new_business_tables_are_required_and_duplicates_rejected(self):
        for table in ('water_transfers', 'well_registration_requests'):
            with self.subTest(table=table):
                block = f'COPY "public"."{table}" ("id") FROM stdin;\n\\.\n'.encode()
                self.assertIn(block, self.dump())
                with self.assertRaisesRegex(RestoreError, 'missing a required'):
                    parse_blocks(self.dump().replace(block, b''))
                with self.assertRaisesRegex(RestoreError, 'repeated public COPY block'):
                    parse_blocks(self.dump() + block)

    def test_checksum_corruption_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / 'backup.tar.gz'
            files = {'roles.sql': b'-- roles', 'schema.sql': b'-- schema', 'data.sql': self.dump()}
            checksums = ''.join(f'{hashlib.sha256(value).hexdigest()}  {key}\n' for key, value in files.items()).encode()
            files['SHA256SUMS'] = checksums
            def write():
                with tarfile.open(archive, 'w:gz') as output:
                    for name, value in files.items():
                        member=tarfile.TarInfo(name); member.size=len(value)
                        output.addfile(member, io.BytesIO(value))
            write()
            self.assertEqual(read_archive(archive)['data.sql'], self.dump())
            files['data.sql'] += b'corruption'
            write()
            with self.assertRaises(RestoreError): read_archive(archive)

if __name__ == '__main__': unittest.main()
