import {backfillMoneyFacts} from './financial-facts';
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
export const MIGRATION_V3=[
'CREATE TABLE IF NOT EXISTS buyback_bookings(booking_id TEXT PRIMARY KEY,week_start TEXT NOT NULL,contract_id TEXT,body TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)',
'CREATE TABLE IF NOT EXISTS buyback_audit(audit_id TEXT PRIMARY KEY,booking_id TEXT NOT NULL,action TEXT NOT NULL,changed_at TEXT NOT NULL,body TEXT NOT NULL)',
'CREATE TABLE IF NOT EXISTS buyback_wallet_links(journal_key TEXT PRIMARY KEY REFERENCES project_records(deduplication_key),booking_id TEXT NOT NULL UNIQUE REFERENCES buyback_bookings(booking_id))',
'CREATE TABLE IF NOT EXISTS buyback_imports(hash TEXT PRIMARY KEY,filename TEXT NOT NULL,imported_at TEXT NOT NULL,original_bytes BLOB NOT NULL,controls TEXT NOT NULL,result TEXT NOT NULL)',
'CREATE TABLE IF NOT EXISTS app_settings(name TEXT PRIMARY KEY,body TEXT NOT NULL,updated_at TEXT NOT NULL)',
'CREATE TABLE IF NOT EXISTS reported_profit_decimal(report_id TEXT PRIMARY KEY REFERENCES reports(report_id),value_decimal TEXT,quality TEXT NOT NULL)',
"INSERT OR IGNORE INTO reported_profit_decimal SELECT report_id,CASE WHEN value IS NULL THEN NULL ELSE printf('%.2f',value) END,quality FROM reported_profit",
];
export const MIGRATION_V4=[
'CREATE TABLE IF NOT EXISTS fleet_sessions(session_id TEXT PRIMARY KEY,started_at TEXT NOT NULL,ended_at TEXT,body TEXT NOT NULL)',
'CREATE TABLE IF NOT EXISTS fleet_buyback_links(booking_id TEXT PRIMARY KEY REFERENCES buyback_bookings(booking_id),session_id TEXT NOT NULL REFERENCES fleet_sessions(session_id),linked_at TEXT NOT NULL)',
];
export const MIGRATION_V5=[
'CREATE TABLE financial_money(source_key TEXT NOT NULL,field TEXT NOT NULL,value_decimal TEXT,quality TEXT NOT NULL,PRIMARY KEY(source_key,field))',
'CREATE TABLE financial_sources(source_key TEXT PRIMARY KEY,body TEXT NOT NULL,is_current INTEGER NOT NULL DEFAULT 1)',
'CREATE TABLE economic_events(event_id TEXT PRIMARY KEY,category TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL)',
'CREATE TABLE event_sources(source_key TEXT PRIMARY KEY REFERENCES financial_sources(source_key),event_id TEXT NOT NULL REFERENCES economic_events(event_id),method TEXT NOT NULL,evidence TEXT NOT NULL,confirmed_at TEXT NOT NULL,manual INTEGER NOT NULL DEFAULT 0)',
'CREATE TABLE reconciliation_decisions(pair_key TEXT PRIMARY KEY,status TEXT NOT NULL,reason TEXT NOT NULL,changed_at TEXT NOT NULL)',
'CREATE TABLE reconciliation_audit(audit_id TEXT PRIMARY KEY,action TEXT NOT NULL,changed_at TEXT NOT NULL,body TEXT NOT NULL)',
'CREATE UNIQUE INDEX manual_session_active ON manual_sessions(character_id) WHERE ended_at IS NULL',
];
export const MIGRATION_V6=[
 'CREATE TABLE contract_observations(contract_id TEXT NOT NULL,character_id TEXT NOT NULL,raw_id TEXT REFERENCES raw_source_records(raw_id),fetched_at TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(contract_id,character_id,fetched_at))',
 'CREATE TABLE contract_decisions(contract_id TEXT PRIMARY KEY,category TEXT,reason TEXT NOT NULL,expected_payout TEXT,revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL)',
 "CREATE TABLE evidence_allocations(allocation_id TEXT PRIMARY KEY,payment_key TEXT NOT NULL REFERENCES financial_sources(source_key),target_key TEXT NOT NULL REFERENCES financial_sources(source_key),amount_decimal TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('payout','aggregate','included_cost')),status TEXT NOT NULL CHECK(status IN ('active','revoked')),reason TEXT NOT NULL,created_at TEXT NOT NULL,revoked_at TEXT)",
 'CREATE INDEX evidence_allocations_payment ON evidence_allocations(payment_key,status)',
 'CREATE INDEX evidence_allocations_target ON evidence_allocations(target_key,status)',
 'CREATE TABLE event_cost_components(component_id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES economic_events(event_id),kind TEXT NOT NULL,treatment TEXT NOT NULL,amount_decimal TEXT,gross_decimal TEXT,net_decimal TEXT,reason TEXT NOT NULL,created_at TEXT NOT NULL)',
 'CREATE TABLE sde_imports(build TEXT PRIMARY KEY,source_url TEXT NOT NULL,sha256 TEXT NOT NULL,imported_at TEXT NOT NULL,body TEXT NOT NULL)',
];
export function migrate(db:DatabaseSync) {
 const version=(db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version;
 if(version>6)throw new Error('Database version is newer than this application');
 const steps:[number,string[]][]=[[2,MIGRATION_V2],[3,MIGRATION_V3],[4,MIGRATION_V4],[5,MIGRATION_V5],[6,MIGRATION_V6]];
 for(const [target,statements] of steps){if(version>=target)continue;db.exec('BEGIN IMMEDIATE');try{for(const sql of statements)db.exec(sql);if(target===5)backfillMoneyFacts(db);db.exec('PRAGMA user_version='+target+'; COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
}
