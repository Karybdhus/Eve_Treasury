import {loadEnvConfig} from '@next/env';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,copyFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {backupDatabase} from '../src/lib/database-backup';
import {resolveDatabasePath} from '../src/lib/database-path';
import {openDatabase,readReports} from '../src/lib/db';
import {observeInventory} from '../src/lib/inventory-provenance';
import {consolidatedFinancials} from '../src/lib/reconciliation';
import {walletLiquidity} from '../src/lib/dashboard-statistics';
import {projectData} from '../src/lib/data-sources';
import {funding} from '../src/lib/accounting';
import {readSettings} from '../src/lib/settings';
import {listBuybacks,buybackAnalytics} from '../src/lib/buyback';
import {motorAnalytics} from '../src/lib/motor-import';

// Only isolated copies are writable. The original is opened read-only for backup.
loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const source=resolveDatabasePath(process.env.DASHBOARD_DB??'data/dashboard.sqlite');
const directory=mkdtempSync(path.join(os.tmpdir(),'eve-inventory-check-'));
const baseline=path.join(directory,'baseline.sqlite'),candidate=path.join(directory,'candidate.sqlite');
backupDatabase(source,baseline);copyFileSync(baseline,candidate);
const hash=(rows:unknown)=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
function tableHashes(db:DatabaseSync){const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as {name:string}[];return Object.fromEntries(names.map(({name})=>[name,hash(db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'" ORDER BY rowid').all())]));}
function financialOutput(db:DatabaseSync){const settings=readSettings(db),rows=projectData(db),reports=readReports(db).map(r=>r.report).filter(r=>r.provenance!=='historical_seed'&&settings.sources[r.source as keyof typeof settings.sources]!==false);return JSON.stringify({summary:consolidatedFinancials(db,{from:'2026-10-04',to:'2026-12-31'}),wallet:walletLiquidity(rows),funding:funding(reports,new Date('2026-10-09T08:00:00Z'),settings),buyback:buybackAnalytics(listBuybacks(db)),trading:motorAnalytics(db)});}
const before=new DatabaseSync(baseline);let beforeHashes:Record<string,string>,financialBefore:string;
try{beforeHashes=tableHashes(before);financialBefore=financialOutput(before);}finally{before.close();}
const after=openDatabase(candidate);let originalTablesEqual=false,financialEqual=false,integrity=false;
try{observeInventory(after);const afterHashes=tableHashes(after);originalTablesEqual=Object.entries(beforeHashes!).every(([name,value])=>afterHashes[name]===value);financialEqual=financialOutput(after)===financialBefore!;integrity=after.prepare('PRAGMA integrity_check').get()!.integrity_check==='ok'&&after.prepare('PRAGMA foreign_key_check').all().length===0;}finally{after.close();}
const reopened=openDatabase(candidate);reopened.close();
console.log(JSON.stringify({originalTablesEqual,financialEqual,integrity,reopen:true,privateCopies:directory}));
if(!originalTablesEqual||!financialEqual||!integrity)throw new Error('Inventory integrity verification failed');
