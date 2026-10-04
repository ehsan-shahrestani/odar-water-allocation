#!/usr/bin/env python3
"""Offline backup validation regressions; no real data or network calls."""
import hashlib
from pathlib import Path
import tempfile
import tarfile
import io
import unittest
from restore_public import parse_blocks, read_archive, RestoreError, TABLE_ORDER

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
