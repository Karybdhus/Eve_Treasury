import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {resolveDatabasePath} from '../src/lib/database-path';
import {openDatabase,getDatabase} from '../src/lib/db';
import {CURRENT_SCHEMA_VERSION,migrate} from '../src/lib/migrations';
import {backupDatabase} from '../src/lib/database-backup';
import {encrypt,decrypt} from '../src/lib/esi/crypto';
import {consolidatedFinancials} from '../src/lib/reconciliation';
import {fixtureDb,archive,confirm,payment,allocate} from './followup-fixtures';
import View from '../src/app/[view]/page';

const temporary=()=>mkdtempSync(path.join(tmpdir(),'eve-order07-storage-'));
function environment(file?:string,seed='0'){
 const keys=['DASHBOARD_DB','DASHBOARD_ACCESS_MODE','DASHBOARD_DEMO_SEED'];
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 if(file===undefined)delete process.env.DASHBOARD_DB;else process.env.DASHBOARD_DB=file;
 process.env.DASHBOARD_ACCESS_MODE='local';process.env.DASHBOARD_DEMO_SEED=seed;
 return ()=>{for(const key of keys){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}};
}
async function observedConnections(run:(handles:Set<DatabaseSync>)=>Promise<void>|void){
 const original=DatabaseSync.prototype.prepare,handles=new Set<DatabaseSync>();
 DatabaseSync.prototype.prepare=function(sql:string){handles.add(this);return original.call(this,sql);};
 try{await run(handles);}finally{DatabaseSync.prototype.prepare=original;}
}

test('Storage paths preserve ordinary relative/absolute names, spaces and in-memory fixtures',()=>{
 const base=path.resolve(tmpdir(),'order07-base');
 assert.equal(resolveDatabasePath('data/dashboard.sqlite',base),path.join(base,'data','dashboard.sqlite'));
 assert.equal(resolveDatabasePath('data/my database.db',base),path.join(base,'data','my database.db'));
 const absolute=path.join(base,'persistent','treasury.sqlite');assert.equal(resolveDatabasePath(absolute,base),absolute);
 assert.equal(resolveDatabasePath(':memory:',base),':memory:');
});
test('Storage path validation refuses blank, NUL, URI, network and drive-relative configuration before opening',()=>{
 for(const value of [String.fromCharCode(47,92)+'fixture-host/share/db.sqlite', '', '  ', '\u0000bad.sqlite','file:fixture.sqlite','https://fixture.invalid/database','C:ambiguous.db','\\\\fixture-host\\share\\db.sqlite','//fixture-host/share/db.sqlite'])assert.throws(()=>openDatabase(value),/Database path/);
});
test('Default database path remains cwd/data/dashboard.sqlite and startup never overwrites populated V6 data',()=>{
 const dir=temporary(),cwd=process.cwd(),restore=environment();
 try{process.chdir(dir);const db=getDatabase();assert.equal(db.location(),path.join(dir,'data','dashboard.sqlite'));db.exec("CREATE TABLE protected(value TEXT);INSERT INTO protected VALUES('opaque fixture history')");db.close();const again=getDatabase();try{assert.equal(again.prepare('SELECT value FROM protected').get()?.value,'opaque fixture history');assert.equal(again.prepare('PRAGMA user_version').get()?.user_version,CURRENT_SCHEMA_VERSION);}finally{again.close();}}
 finally{process.chdir(cwd);restore();rmSync(dir,{recursive:true,force:true});}
});
test('Configured external local path persists across process cwd changes without moving the legacy file',()=>{
 const dir=temporary(),cwd=process.cwd(),file=path.join(dir,'persistent','treasury.db'),restore=environment(file);
 try{const first=getDatabase();first.exec("CREATE TABLE evidence(value TEXT);INSERT INTO evidence VALUES('fixture decision')");first.close();const other=path.join(dir,'other');mkdirSync(other);process.chdir(other);const db=getDatabase();try{assert.equal(db.prepare('SELECT value FROM evidence').get()?.value,'fixture decision');assert.equal(db.location(),file);}finally{db.close();}assert.deepEqual(readdirSync(other),[]);}
 finally{process.chdir(cwd);restore();rmSync(dir,{recursive:true,force:true});}
});
test('Newer schema is rejected before WAL, reports initialization or any database-byte change',async()=>{
 const dir=temporary(),file=path.join(dir,'future.sqlite'),initial=new DatabaseSync(file);
 initial.exec("PRAGMA user_version=99;CREATE TABLE evidence(value TEXT);INSERT INTO evidence VALUES('preserve')");initial.close();const before=readFileSync(file);
 try{await observedConnections(handles=>{assert.throws(()=>openDatabase(file),/newer/);assert.equal(handles.size,1);assert.ok([...handles].every(db=>!db.isOpen));});assert.deepEqual(readFileSync(file),before);assert.deepEqual(readdirSync(dir),['future.sqlite']);const check=new DatabaseSync(file,{readOnly:true});try{assert.equal(check.prepare("SELECT name FROM sqlite_master WHERE name='reports'").get(),undefined);assert.equal(check.prepare('PRAGMA journal_mode').get()?.journal_mode,'delete');assert.equal(check.prepare('PRAGMA user_version').get()?.user_version,99);}finally{check.close();}}
 finally{rmSync(dir,{recursive:true,force:true});}
});
test('Invalid negative schema is rejected without initialization and standalone migrate has the same guard',()=>{
 const db=new DatabaseSync(':memory:');try{db.exec('PRAGMA user_version=-1');assert.throws(()=>migrate(db),/invalid/);assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='characters'").get(),undefined);}finally{db.close();}
});
test('Failed V6 startup closes its connection, rolls back the failed step and retains prior records',async()=>{
 const dir=temporary(),file=path.join(dir,'migration.sqlite'),db=openDatabase(file);
 for(const name of ['contract_observations','contract_decisions','evidence_allocations','event_cost_components','sde_imports'])db.exec('DROP TABLE '+name);
 db.exec("PRAGMA user_version=5;CREATE TABLE contract_decisions(conflict TEXT);CREATE TABLE preservation(value TEXT);INSERT INTO preservation VALUES('original')");db.close();
 try{await observedConnections(handles=>{assert.throws(()=>openDatabase(file),/already exists/);assert.ok([...handles].every(c=>!c.isOpen));});const after=new DatabaseSync(file,{readOnly:true});try{assert.equal(after.prepare('PRAGMA user_version').get()?.user_version,5);assert.equal(after.prepare('SELECT value FROM preservation').get()?.value,'original');assert.equal(after.prepare("SELECT name FROM sqlite_master WHERE name='contract_observations'").get(),undefined);assert.equal(after.prepare('PRAGMA integrity_check').get()?.integrity_check,'ok');}finally{after.close();}}
 finally{rmSync(dir,{recursive:true,force:true});}
});
test('Failed optional seeding closes the newly opened connection without resetting an existing database',async()=>{
 const dir=temporary(),file=path.join(dir,'fixture.sqlite'),cwd=process.cwd(),restore=environment(file,'1'),db=openDatabase(file);db.exec("CREATE TABLE preserved(value TEXT);INSERT INTO preserved VALUES('retain')");db.close();
 try{process.chdir(dir);await observedConnections(handles=>{assert.throws(()=>getDatabase(),/ENOENT/);assert.ok([...handles].every(c=>!c.isOpen));});const check=new DatabaseSync(file,{readOnly:true});try{assert.equal(check.prepare('SELECT value FROM preserved').get()?.value,'retain');assert.equal(check.prepare('SELECT COUNT(*) n FROM reports').get()?.n,0);}finally{check.close();}}
 finally{process.chdir(cwd);restore();rmSync(dir,{recursive:true,force:true});}
});
test('Main view closes owned connections when initial financial state is invalid',async()=>{
 const dir=temporary(),file=path.join(dir,'view.sqlite'),restore=environment(file),db=openDatabase(file);
 db.prepare('INSERT INTO app_settings VALUES (?,?,?)').run('project','invalid-json','fixture');db.close();
 try{await observedConnections(async handles=>{await assert.rejects(()=>View({params:Promise.resolve({view:'overview'}),searchParams:Promise.resolve({})}));assert.ok(handles.size>=1);assert.ok([...handles].every(c=>!c.isOpen));});}
 finally{restore();rmSync(dir,{recursive:true,force:true});}
});
test('Assets view closes both owned connections when the character query fails',async()=>{
 const dir=temporary(),file=path.join(dir,'assets.sqlite'),restore=environment(file),db=openDatabase(file);db.exec('DROP TABLE characters');db.close();
 try{await observedConnections(async handles=>{await assert.rejects(()=>View({params:Promise.resolve({view:'assets'}),searchParams:Promise.resolve({})}),/characters/);assert.equal(handles.size,2);assert.ok([...handles].every(c=>!c.isOpen));});}
 finally{restore();rmSync(dir,{recursive:true,force:true});}
});
test('Portable WAL backup preserves twelve synthetic authorizations and financial output with the original key',()=>{
 const dir=temporary(),file=path.join(dir,'source.sqlite'),copyFile=path.join(dir,'portable.sqlite'),db=fixtureDb(file),key=randomBytes(32);
 try{archive(db);confirm(db);allocate(db,payment(db));for(let i=1;i<=12;i++){const id=String(1000+i);if(!db.prepare('SELECT character_id FROM characters WHERE character_id=?').get(id))db.prepare('INSERT INTO characters VALUES (?,?,?,?,?,?,?,?,?)').run(id,'Synthetic '+i,'[]','fixture','connected','g','2026-10-09T00:00:00Z',null,null);db.prepare('INSERT INTO encrypted_credentials VALUES (?,?,?,?,?)').run(id,encrypt('synthetic-access-'+i,'access:'+id,key),encrypt('synthetic-refresh-'+i,'refresh:'+id,key),9999999999999,'g');}
 const financialBefore=JSON.stringify(consolidatedFinancials(db)),rowsBefore=JSON.stringify(db.prepare('SELECT * FROM encrypted_credentials ORDER BY character_id').all());assert.deepEqual(backupDatabase(file,copyFile),{schemaVersion:CURRENT_SCHEMA_VERSION});const copy=openDatabase(copyFile);try{assert.equal(copy.prepare('PRAGMA integrity_check').get()?.integrity_check,'ok');assert.deepEqual(copy.prepare('PRAGMA foreign_key_check').all(),[]);const rows=copy.prepare('SELECT * FROM encrypted_credentials ORDER BY character_id').all() as {character_id:string;access_cipher:string}[];assert.equal(rows.length,12);assert.equal(JSON.stringify(copy.prepare('SELECT * FROM encrypted_credentials ORDER BY character_id').all()),rowsBefore);for(const row of rows){assert.match(decrypt(row.access_cipher,'access:'+row.character_id,key),/^synthetic-access-/);assert.throws(()=>decrypt(row.access_cipher,'access:'+row.character_id,randomBytes(32)));assert.throws(()=>decrypt(row.access_cipher,'access:other',key));}assert.equal(JSON.stringify(consolidatedFinancials(copy)),financialBefore);}finally{copy.close();}assert.equal(JSON.stringify(db.prepare('SELECT * FROM encrypted_credentials ORDER BY character_id').all()),rowsBefore);}
 finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('Consistent backup includes committed WAL only and never accepts a corrupt source',()=>{
 const dir=temporary(),file=path.join(dir,'wal.sqlite'),db=new DatabaseSync(file);
 try{db.exec("PRAGMA journal_mode=WAL;CREATE TABLE evidence(value TEXT);INSERT INTO evidence VALUES('committed');BEGIN IMMEDIATE;INSERT INTO evidence VALUES('uncommitted')");const out=path.join(dir,'snapshot.sqlite');backupDatabase(file,out);const copy=new DatabaseSync(out,{readOnly:true});try{assert.deepEqual(copy.prepare('SELECT value FROM evidence').all().map(r=>r.value),['committed']);}finally{copy.close();}db.exec('ROLLBACK');const corrupt=path.join(dir,'corrupt.sqlite');writeFileSync(corrupt,'not a database');const before=createHash('sha256').update(readFileSync(corrupt)).digest('hex');assert.throws(()=>backupDatabase(corrupt,path.join(dir,'invalid-copy.sqlite')));assert.equal(createHash('sha256').update(readFileSync(corrupt)).digest('hex'),before);}
 finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
