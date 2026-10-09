import {createHash} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {reconciliation} from './reconciliation';
import {dateKey} from './time';

type State=ReturnType<typeof reconciliation>;
const models=new Map<string,{revision:string;state:State;computedAt:string}>();
const tables=['reports','imported_source_reports','buyback_bookings','buyback_wallet_links','app_settings','contract_observations','contract_decisions','evidence_allocations','event_cost_components','economic_events','event_sources','reconciliation_decisions','reconciliation_audit','financial_money','reported_profit_decimal'];
export function financialRevision(db:DatabaseSync){
 const hash=createHash('sha256').update(dateKey(new Date()));
 for(const table of tables){hash.update(table);hash.update(JSON.stringify(db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()));}
 hash.update(JSON.stringify(db.prepare('SELECT character_id,connection_status FROM characters ORDER BY character_id').all()));
 hash.update(JSON.stringify(db.prepare("SELECT * FROM project_records WHERE kind IN ('wallet_journal','wallet_transaction','motor_trade','industry_job','mining_entry','pi_colony','pi_pin','market_order','wallet_snapshot','wallet_balance','ess_observation') ORDER BY deduplication_key").all()));
 return hash.digest('hex');
}
export function financialReadModel(db:DatabaseSync){
 const location=(db.prepare('PRAGMA database_list').all() as {name:string;file:string}[]).find(r=>r.name==='main')?.file;
 if(!location)return reconciliation(db);
 const revision=financialRevision(db),old=models.get(location);
 if(old?.revision===revision)return old.state;
 // Rebuild only for an authoritative revision change, never publish partial failures.
 const state=reconciliation(db);
 models.set(location,{revision:financialRevision(db),state,computedAt:new Date().toISOString()});
 if(models.size>8)models.delete(models.keys().next().value!);
 return state;
}
