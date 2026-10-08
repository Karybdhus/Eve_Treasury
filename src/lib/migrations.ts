import type {DatabaseSync} from 'node:sqlite';
export const MIGRATION_V2 = [
'CREATE TABLE IF NOT EXISTS characters (character_id TEXT PRIMARY KEY, name TEXT NOT NULL, scopes TEXT NOT NULL, owner_hash TEXT NOT NULL, connection_status TEXT NOT NULL, generation TEXT NOT NULL, connected_at TEXT NOT NULL, last_sync TEXT, last_error TEXT)',
'CREATE TABLE IF NOT EXISTS encrypted_credentials (character_id TEXT PRIMARY KEY REFERENCES characters(character_id), access_cipher TEXT NOT NULL, refresh_cipher TEXT NOT NULL, expires_at INTEGER NOT NULL, generation TEXT NOT NULL)',
'CREATE TABLE IF NOT EXISTS oauth_states (state_hash TEXT PRIMARY KEY, verifier_cipher TEXT NOT NULL, expires_at INTEGER NOT NULL, expected_character_id TEXT)',
'CREATE TABLE IF NOT EXISTS esi_sync_runs (run_id TEXT PRIMARY KEY, character_id TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL, details TEXT NOT NULL)',
'CREATE TABLE IF NOT EXISTS sync_locks (character_id TEXT PRIMARY KEY, lease_id TEXT NOT NULL, expires_at INTEGER NOT NULL)',
'CREATE TABLE IF NOT EXISTS raw_source_records (raw_id TEXT PRIMARY KEY, source TEXT NOT NULL, character_id TEXT, endpoint TEXT NOT NULL, entity_id TEXT, fetched_at TEXT NOT NULL, source_timestamp TEXT, payload_text TEXT NOT NULL, payload_hash TEXT NOT NULL, UNIQUE(source, character_id, endpoint, entity_id, payload_hash))',
'CREATE TABLE IF NOT EXISTS project_records (deduplication_key TEXT PRIMARY KEY, kind TEXT NOT NULL, source TEXT NOT NULL, source_class TEXT NOT NULL, source_character_id TEXT, source_entity_id TEXT, fetched_at TEXT NOT NULL, source_timestamp TEXT, data_quality TEXT NOT NULL, status TEXT NOT NULL, body TEXT NOT NULL, raw_id TEXT REFERENCES raw_source_records(raw_id), is_current INTEGER NOT NULL DEFAULT 1)',
'CREATE INDEX IF NOT EXISTS project_records_kind ON project_records(kind,source_character_id,is_current)',
'CREATE TABLE IF NOT EXISTS esi_cache (cache_key TEXT PRIMARY KEY, body TEXT NOT NULL, etag TEXT, expires_at INTEGER NOT NULL, fetched_at TEXT NOT NULL, source_timestamp TEXT)',
'CREATE TABLE IF NOT EXISTS esi_rate_limits (rate_group TEXT PRIMARY KEY, retry_at INTEGER NOT NULL)',
'CREATE TABLE IF NOT EXISTS manual_sessions (session_id TEXT PRIMARY KEY, character_id TEXT NOT NULL REFERENCES characters(character_id), type TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, notes TEXT NOT NULL)',
'CREATE TABLE IF NOT EXISTS imported_source_reports (report_id TEXT PRIMARY KEY REFERENCES reports(report_id), raw_body TEXT NOT NULL, contract TEXT NOT NULL)',
'CREATE TABLE IF NOT EXISTS reported_profit (report_id TEXT PRIMARY KEY REFERENCES reports(report_id), value REAL, quality TEXT NOT NULL)',
'CREATE TABLE IF NOT EXISTS wallet_classifications (deduplication_key TEXT PRIMARY KEY REFERENCES project_records(deduplication_key), category TEXT NOT NULL, quality TEXT NOT NULL, rule_version TEXT NOT NULL)',
...['mining_entry','pi_colony','pi_pin','wallet_journal','wallet_transaction','industry_job','market_order'].map(kind=>'CREATE VIEW IF NOT EXISTS '+({mining_entry:'mining_entries',pi_colony:'pi_colonies',pi_pin:'pi_pins',wallet_journal:'wallet_journal_entries',wallet_transaction:'wallet_transactions',industry_job:'industry_jobs',market_order:'market_orders'}[kind])+" AS SELECT * FROM project_records WHERE kind='"+kind+"'"),
];
export function migrate(db:DatabaseSync) {
  const version=(db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version;
  if(version>2)throw new Error('Database version is newer than this application');
  if(version<2){
    db.exec('BEGIN IMMEDIATE');
    try{for(const sql of MIGRATION_V2)db.exec(sql);db.exec('PRAGMA user_version=2; COMMIT');}
    catch(e){db.exec('ROLLBACK');throw e;}
  }
}
