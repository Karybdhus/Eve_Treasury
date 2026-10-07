import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { validateReport, type Report } from './contracts';

export type StoredReport = {report:Report; importedAt:string; filename:string};
export function openDatabase(filename = process.env.DASHBOARD_DB ?? path.join(process.cwd(),'data','dashboard.sqlite')) {
  if(filename!==':memory:') mkdirSync(path.dirname(filename),{recursive:true});
  const db=new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS reports (report_id TEXT PRIMARY KEY, scope_key TEXT NOT NULL UNIQUE, body TEXT NOT NULL, imported_at TEXT NOT NULL, filename TEXT NOT NULL); PRAGMA user_version=1;');
  return db;
}
function scope(r:Report) {
  if(r.reportType==='daily') return `${r.pillar}:daily:${r.status}:${new Date(r.period.from).toISOString().slice(0,10)}`;
  if(r.data.kind==='MiningSessionReport') return `mining:session:${r.status}:${r.data.sessionId}`;
  return `${r.data.kind}:${r.status}:${new Date(r.period.to).toISOString()}`;
}
export function importReports(db:DatabaseSync, input:unknown, filename:string) {
  const list=Array.isArray(input)?input:[input];
  if(list.length===0 || list.length>500) throw new Error('Import requires 1 to 500 reports');
  const reports=list.map((r,i)=>{try{return validateReport(r);}catch(e){throw new Error(`Report ${i+1}: ${(e as Error).message}`);}});
  let imported=0, skipped=0;
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const r of reports){
      const body=JSON.stringify(r);
      const old=db.prepare('SELECT body FROM reports WHERE report_id=?').get(r.reportId) as {body:string}|undefined;
      if(old){if(old.body!==body) throw new Error(`reportId ${r.reportId} already exists with different content. Reports are immutable.`); skipped++;continue;}
      const conflict=db.prepare('SELECT report_id FROM reports WHERE scope_key=?').get(scope(r));
      if(conflict) throw new Error(`Overlapping report for ${scope(r)}. One project-wide daily aggregate / session / snapshot per status and period is allowed.`);
      db.prepare('INSERT INTO reports VALUES (?,?,?,?,?)').run(r.reportId,scope(r),body,new Date().toISOString(),path.basename(filename)); imported++;
    }
    db.exec('COMMIT'); return {imported,skipped};
  }catch(e){db.exec('ROLLBACK');throw e;}
}
export function seedDatabase(db:DatabaseSync) {
  // Seed only on an empty database, never overwrite user data.
  const n=db.prepare('SELECT COUNT(*) AS n FROM reports').get() as {n:number};
  if(n.n===0){const dir=path.join(process.cwd(),'seed');for(const name of readdirSync(dir).filter(n=>n.endsWith('.json')).sort())importReports(db,JSON.parse(readFileSync(path.join(dir,name),'utf8')),name);}
}
export function getDatabase() {const db=openDatabase();seedDatabase(db);return db;}
export function readReports(db:DatabaseSync):StoredReport[] {
  return (db.prepare('SELECT body,imported_at,filename FROM reports ORDER BY imported_at DESC, report_id').all() as {body:string;imported_at:string;filename:string}[]).map(r=>({report:validateReport(JSON.parse(r.body)),importedAt:r.imported_at,filename:r.filename}));
}
