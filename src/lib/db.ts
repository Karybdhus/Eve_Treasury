import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,readdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {validateReport,type Report} from './contracts';
import {normalizeImport} from './report-standard';
import {migrate} from './migrations';
import {profit} from './accounting';
import {dateKey} from './time';
import {storeRaw,storeRecord,sourceClass} from './source-records';
export type StoredReport={report:Report;importedAt:string;filename:string};
export function openDatabase(filename=process.env.DASHBOARD_DB??path.join(process.cwd(),'data','dashboard.sqlite')){
 if(filename!==':memory:')mkdirSync(path.dirname(filename),{recursive:true});
 const db=new DatabaseSync(filename);
 db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS reports (report_id TEXT PRIMARY KEY,scope_key TEXT NOT NULL UNIQUE,body TEXT NOT NULL,imported_at TEXT NOT NULL,filename TEXT NOT NULL);');
 const version=(db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version;
 if(filename!==':memory:'&&version===1&&!existsSync(filename+'.pre-v2.sqlite'))db.prepare('VACUUM INTO ?').run(filename+'.pre-v2.sqlite');
 if(filename!==':memory:'&&version===2&&!existsSync(filename+'.pre-v3.sqlite'))db.prepare('VACUUM INTO ?').run(filename+'.pre-v3.sqlite');
 migrate(db);return db;
}
function scope(r:Report){
 if(r.reportType==='daily')return r.pillar+':daily:'+r.status+':'+dateKey(r.period.from,r.reportingTimezone??'UTC');
 if(r.data.kind==='MiningSessionReport')return 'mining:session:'+r.status+':'+r.data.sessionId;
 return r.data.kind+':'+r.reportType+':'+r.status+':'+new Date(r.period.to).toISOString();
}
export function importReports(db:DatabaseSync,input:unknown,filename:string){
 const list=Array.isArray(input)?input:[input];
 if(!list.length||list.length>500)throw new Error('Import requires 1 to 500 reports');
 const normalized=list.map((r,i)=>{try{return normalizeImport(r);}catch(e){throw new Error('Report '+(i+1)+': '+(e as Error).message);}});
 let imported=0,skipped=0;db.exec('BEGIN IMMEDIATE');
 try{
  for(let i=0;i<normalized.length;i++){
   const {report:r,contract,reportedProfit}=normalized[i],body=JSON.stringify(r),rawBody=JSON.stringify(list[i]);
   const old=db.prepare('SELECT body FROM reports WHERE report_id=?').get(r.reportId) as {body:string}|undefined;
   if(old){const original=db.prepare('SELECT raw_body FROM imported_source_reports WHERE report_id=?').get(r.reportId) as {raw_body:string}|undefined;if(original&&!isDeepStrictEqual(JSON.parse(original.raw_body),list[i]))throw new Error('reportId '+r.reportId+' original content changed. Reports are immutable.');if(old.body!==body)throw new Error('reportId '+r.reportId+' already exists with different content. Reports are immutable.');skipped++;continue;}
   // Existing V1 snapshot scope keys are preserved. Semantic comparison bridges the migration.
   const conflict=db.prepare('SELECT body FROM reports WHERE scope_key=?').get(scope(r));
   const semantic=db.prepare('SELECT body FROM reports').all() as {body:string}[];
   if(conflict||semantic.some(x=>scope(validateReport(JSON.parse(x.body)))===scope(r)))throw new Error('Overlapping report for '+scope(r)+'. One project-wide aggregate per status and period is allowed.');
   if(r.status==='actual'&&r.provenance!=='historical_seed'&&r.reportType==='daily'&&(typeof profit(r)==='number'&&profit(r)!==0||typeof r.derivedNetProfit==='number'&&r.derivedNetProfit!==0)){
    const used=new Set(r.sourceTransactionIds??[]);
    for(const prior of semantic){const oldReport=validateReport(JSON.parse(prior.body));if(oldReport.status==='actual'&&oldReport.provenance!=='historical_seed'&&oldReport.reportType==='daily'&&(typeof profit(oldReport)==='number'&&profit(oldReport)!==0||typeof oldReport.derivedNetProfit==='number'&&oldReport.derivedNetProfit!==0)&&(oldReport.sourceTransactionIds??[]).some(id=>used.has(id)))throw new Error('Source transaction already used in another actual profit report; explicit reconciliation required');}
   }
   const fetchedAt=new Date().toISOString();
   db.prepare('INSERT INTO reports VALUES (?,?,?,?,?)').run(r.reportId,scope(r),body,fetchedAt,path.basename(filename));
   db.prepare('INSERT INTO imported_source_reports VALUES (?,?,?)').run(r.reportId,rawBody,contract);
   if(reportedProfit!==undefined)db.prepare('INSERT INTO reported_profit_decimal VALUES (?,?,?)').run(r.reportId,typeof reportedProfit==='number'?reportedProfit.toFixed(2):null,typeof reportedProfit==='number'?'measured':reportedProfit);
   const rawId=storeRaw(db,{source:r.source,endpoint:'json-import',entityId:r.reportId,fetchedAt,sourceTimestamp:r.period.to,payloadText:rawBody});
   storeRecord(db,{kind:'report',source:r.source,sourceClass:sourceClass(r.source),sourceEntityId:r.reportId,fetchedAt,sourceTimestamp:r.period.to,dataQuality:r.provenance==='historical_seed'?'historical_seed':'partial',status:r.status,deduplicationKey:'report:'+r.reportId,data:r,rawId});
   imported++;
  }
  db.exec('COMMIT');return {imported,skipped};
 }catch(e){db.exec('ROLLBACK');throw e;}
}
export function seedDatabase(db:DatabaseSync){
 const n=db.prepare('SELECT COUNT(*) AS n FROM reports').get() as {n:number};
 if(!n.n){const dir=path.join(process.cwd(),'seed');for(const name of readdirSync(dir).filter(n=>n.endsWith('.json')).sort())importReports(db,JSON.parse(readFileSync(path.join(dir,name),'utf8')),name);}
}
export function getDatabase(){const db=openDatabase();seedDatabase(db);return db;}
export function readReports(db:DatabaseSync):StoredReport[]{
 return (db.prepare('SELECT body,imported_at,filename FROM reports ORDER BY imported_at DESC,report_id').all() as {body:string;imported_at:string;filename:string}[]).map(r=>({report:validateReport(JSON.parse(r.body)),importedAt:r.imported_at,filename:r.filename}));
}
