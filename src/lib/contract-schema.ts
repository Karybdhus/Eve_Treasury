// Additive relations extend archived contracts; no new cash ledger is created.
export const CONTRACT_SCHEMA=[
 'CREATE TABLE contract_item_origins(link_id TEXT PRIMARY KEY,contract_id TEXT NOT NULL,record_id TEXT NOT NULL,item_id TEXT NOT NULL,slice_id TEXT NOT NULL,quantity TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN (\'active\',\'revoked\')),body TEXT NOT NULL,created_at TEXT NOT NULL,revoked_at TEXT)',
 'CREATE INDEX contract_origins_item ON contract_item_origins(contract_id,record_id,status)',
 'CREATE INDEX contract_origins_slice ON contract_item_origins(item_id,slice_id,status)',
];
