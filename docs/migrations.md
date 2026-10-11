# Storage migrations

## Version 1 -> 2

The existing Next.js / node:sqlite architecture and reports table remain in place.
openDatabase checks PRAGMA user_version. This section describes the historical v1 -> v2 step; current version guards are implemented in src/lib/migrations.ts.
Version 1 receives an automatic consistent SQLite VACUUM INTO backup:
data/dashboard.sqlite.pre-v2.sqlite (or the configured filename with this suffix).
The backup is created once, before any schema changes, and stays ignored by Git.
Version 0 is a fresh database and does not need a historical backup.
Never overwrite or delete a synced project reference.

Migration uses one BEGIN IMMEDIATE transaction, foreign keys and WAL.
All V1 report rows and bodies remain unchanged; no seed is promoted to live actual.
V1 UTC periods retain their original interpretation. New Drive standard reports use
Europe/Berlin with original offset timestamps preserved. Deduplication scopes bridge
the old snapshot keys without rewriting immutable historical bodies.

New tables:
- characters: ID, name, owner hash, scopes, connection state, authorization generation,
  last fully successful sync, last safe error.
- encrypted_credentials: AES-256-GCM ciphertext for access and refresh tokens.
- oauth_states: short-lived, one-use state hashes and encrypted PKCE verifiers.
- esi_sync_runs / sync_locks: partial/success history and a renewable character lease.
- raw_source_records: immutable original response/import text, endpoint, hashes and provenance.
- project_records: normalized records with source, source class, character/entity IDs,
  fetchedAt, sourceTimestamp, quality, actual/plan/estimate and stable deduplication key.
- esi_cache / esi_rate_limits: TTL/ETag payload cache, page metadata and retry deadlines.
- manual_sessions: start/end, type, character and notes.
- imported_source_reports: original JSON and contract classification for new imports.
- reported_profit: imported reported result and evidence quality.
- wallet_classifications: separate versioned rules; raw journal entries are never rewritten.

Typed SQLite views expose mining_entries, pi_colonies, pi_pins,
wallet_journal_entries, wallet_transactions, industry_jobs and market_orders.
These intentionally read project_records instead of duplicating source metadata
across seven similar tables. Existing reports continue to hold the normalized
dashboard contract. Source records and JSON reports never automatically add
the same underlying production or profit twice.

## History / deduplication

Mining key: character + UTC ledger day + typeId + solarSystemId.
Quantity is a cumulative value and changes replace the normalized bucket;
old raw responses remain intact. Recent ledger omissions clear current status,
while buckets older than ESI's 30-day window remain historical measured records.
PI colony key: character + planet. Pins: character + planet + pin.
Complete colony snapshots replace current pins/layout; absent colonies/pins leave
current view but their normalized history and raw response remain stored.
Journal: character + ESI journal id (ref_id). Transaction: character + transaction_id.
Industry: character + job_id, with updated status; complete returned job snapshots
update known jobs without discarding jobs outside CCP's retention window.
Market: character + order_id; absent orders leave current view after a successful fetch.
Character IDs and int64 entity IDs are strings internally and are parsed losslessly.

Every data area commits only after pagination and normalization finish successfully.
A partial sync keeps earlier valid data from a failed area and records the error.
Disconnect removes local encrypted credentials, clears that character's HTTP cache,
and preserves history; disconnected source data is shown stale.
Authorization generations prevent an in-flight sync from overwriting a disconnect
or reauthorization. Sync leases prevent concurrent refresh/sync for one character.

## Backup / recovery

Stop the local server before making a manual copy of the whole data directory,
including any WAL/SHM files. Do not commit these files or .env.local.
Keep TOKEN_ENCRYPTION_KEY separately and securely; changing or losing it requires
reauthorizing every character. APPLICATION_SECRET rotation invalidates pending SSO cookies.
To return to V1, use the pre-v2 backup together with the matching V1 source version.
Do not open a V2 database with V1 code; V1 has no V2 schema-version guard.


## Current schema and operator boundary

The current code supports schema version 8. Subsequent additive steps add exact-money reconciliation, contracts, provenance and stock reservations. Startup rejects unsupported newer schemas before initialization. Migration steps remain transactional; no automatic downgrade exists.

Before an authorized production migration, create a consistent backup and verify restoration and migration on an isolated copy. Existing database paths, source evidence and encryption keys must be preserved. Repository sanitation does not authorize migrations or account synchronization.
