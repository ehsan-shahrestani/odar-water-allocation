#!/usr/bin/env bash
set -euo pipefail

root_dir=$(cd "$(dirname "$0")/../.." && pwd)
container_id=$(docker run -d --rm --network none -e POSTGRES_PASSWORD=local-test-only postgres:17)
trap 'docker stop "$container_id" >/dev/null' EXIT

for attempt in {1..30}; do
  if docker exec "$container_id" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  if [[ $attempt == 30 ]]; then echo 'Postgres did not start' >&2; exit 1; fi
  sleep 1
done

cat "$root_dir/supabase/tests/transfer-security-setup.sql" \
    "$root_dir/supabase/migrations/20261102030404_water_transfers.sql" \
    "$root_dir/supabase/tests/transfer-security.sql" | \
  docker exec -i "$container_id" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres
