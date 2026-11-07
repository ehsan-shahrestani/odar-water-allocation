"""Restore diagnostics must locate failures without exposing backup rows."""

import sys
import unittest
from pathlib import Path
from subprocess import CompletedProcess
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))

import verify_backup_restore as verification


class VerificationTests(unittest.TestCase):
    def test_storage_version_is_pinned_before_database_start(self):
        class StartupChecked(Exception):
            pass

        def check_start(command, **options):
            self.assertEqual(command[:3], ['supabase', 'db', 'start'])
            workdir = Path(command[command.index('--workdir') + 1])
            self.assertEqual(
                (workdir / 'supabase' / '.temp' / 'storage-version').read_text(),
                'v1.90.0\n',
            )
            self.assertFalse((workdir / 'supabase' / '.temp' / 'project-ref').exists())
            raise StartupChecked

        with (
            patch.object(verification, 'read_archive', return_value={}),
            patch.object(verification, 'load_snapshot'),
            patch.object(verification, 'run', side_effect=check_start),
            patch.object(verification.subprocess, 'run') as cleanup,
            patch('builtins.print'),
        ):
            with self.assertRaises(StartupChecked):
                verification.verify(Path('synthetic-backup.tar.gz'))
        self.assertEqual(cleanup.call_args.args[0][:2], ['supabase', 'stop'])
        self.assertIn('--no-backup', cleanup.call_args.args[0])

    def failure(self, stderr, sources=()):
        result = CompletedProcess(['docker'], 1, b'', stderr)
        with patch.object(verification.subprocess, 'run', return_value=result):
            with self.assertRaises(RuntimeError) as raised:
                verification.run(['docker'], sources=sources)
        return str(raised.exception)

    def test_missing_relation_reports_archive_location_without_sensitive_context(self):
        error = (
            b'psql:<stdin>:12: ERROR:  42P01: relation "auth.future_table" does not exist\n'
            b'LINE 1: COPY auth.future_table FROM stdin;\n'
            b'CONTEXT: COPY users, line 1: "private-phone private-token"\n'
            b'LOCATION: parserOpenTable, parse_relation.c:1449\n'
        )
        message = self.failure(error, [('roles.sql', 1, 3), ('data.sql', 8, 20)])
        self.assertEqual(
            message,
            'Isolated backup restore failed: docker '
            '(SQLSTATE 42P01; data.sql:5; missing relation auth.future_table)',
        )

    def test_other_errors_never_report_values_or_messages(self):
        message = self.failure(
            'psql:<stdin>:7: ERROR:  23505: duplicate key value violates unique constraint "private"\n'
            'DETAIL: Key (phone)=(private-phone) already exists.\n'
        )
        self.assertEqual(message, 'Isolated backup restore failed: docker (SQLSTATE 23505)')

    def test_nonstandard_relation_identifiers_are_redacted(self):
        for identifier in ('private email@example.com', 'private\\nphone', 'private"phone'):
            with self.subTest(identifier=identifier):
                message = self.failure(f'ERROR: 42P01: relation "{identifier}" does not exist\n')
                self.assertEqual(message, 'Isolated backup restore failed: docker (SQLSTATE 42P01)')

    def test_old_sqlstate_only_format_still_works(self):
        self.assertEqual(
            self.failure(b'ERROR:  42P01\n'),
            'Isolated backup restore failed: docker (SQLSTATE 42P01)',
        )

    def test_non_sql_errors_do_not_leak_command_or_stderr(self):
        self.assertEqual(
            self.failure(b'Cannot connect using private-connection-string\n'),
            'Isolated backup restore failed: docker',
        )

    def test_sql_sections_share_a_transaction_and_preserve_source_line_numbers(self):
        with patch.object(verification, 'run') as run:
            verification.run_sql('isolated-container', [
                ('roles.sql', b'-- roles\n'),
                ('schema.sql', b'-- schema'),
                ('data.sql', b'-- data\n\\.\n'),
            ])
        command = run.call_args.args[0]
        self.assertIn('--single-transaction', command)
        self.assertIn('--file=-', command)
        self.assertIn('VERBOSITY=verbose', command)
        self.assertEqual(command[3], 'isolated-container')
        self.assertEqual(command[command.index('-d') + 1], 'postgres')
        self.assertEqual(run.call_args.kwargs['input'], b'-- roles\n\n-- schema\n-- data\n\\.\n\n')
        self.assertEqual(run.call_args.kwargs['sources'], [
            ('roles.sql', 1, 2), ('schema.sql', 3, 3), ('data.sql', 4, 6),
        ])


if __name__ == '__main__':
    unittest.main()
