import {DatabaseSync} from 'node:sqlite';
import {existsSync,readdirSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/lib/db';
const filename=process.env.DASHBOARD_DB??path.join(process.cwd(),'data','dashboard.sqlite');
function counts(db:DatabaseSync){
 return Object.fromEntries(['reports','buyback_bookings','raw_source_records','manual_sessions','fleet_sessions'].map(table=>{
  const exists=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
  return [table,exists?(db.prepare('SELECT COUNT(*) n FROM '+table).get() as {n:number}).n:0];
 }));
}
if(!existsSync(filename))throw new Error('Existing database required; no demo data will be created');
const old=new DatabaseSync(filename,{readOnly:true}),before=counts(old),version=(old.prepare('PRAGMA user_version').get() as {user_version:number}).user_version;old.close();
const db=openDatabase(filename);
try{
 const after=counts(db);assert.deepEqual(after,before,'Original entity counts changed unexpectedly');
 const current=(db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version;
 const backups=readdirSync(path.dirname(filename)).filter(n=>n.startsWith(path.basename(filename)+'.pre-v5-'));
 assert.equal(current,5);if(version<5)assert.ok(backups.length>0,'Pre-migration backup required');
 console.log(JSON.stringify({beforeVersion:version,afterVersion:current,before,after,backupFiles:backups},null,2));
}finally{db.close();}
