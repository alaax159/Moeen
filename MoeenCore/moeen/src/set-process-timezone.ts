// Pin the Node process timezone to UTC before ANY other module loads.
//
// Every timestamp column in this repo is written as UTC wall-clock: Drizzle's
// PgTimestamp.mapToDriverValue serializes Dates via `.toISOString()`, and the
// columns are Postgres `timestamp` WITHOUT time zone, so the trailing `Z` is
// dropped on write. On read, node-postgres parses that naive value with a
// local-time Date constructor (postgres-date) — i.e. in *this process's*
// timezone. The write/read round-trip is therefore only correct when the
// process runs in UTC. Nothing in the deploy setup (no Dockerfile, no compose
// env, no start script) sets TZ, so pin it here.
//
// Stopgap only — see the TODO in src/database/schema/dose-log.schema.ts for the
// bulletproof fix (migrate those columns to `timestamptz`).
process.env.TZ = 'UTC';
