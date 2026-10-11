import test from 'node:test';
import assert from 'node:assert/strict';
import {applicationOrigin,assertApplicationRequest,privateAccessConfig} from '../src/lib/application-access';
import {backupDatabase} from '../src/lib/database-backup';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const origin='https://dashboard.fixture.ts.net';
const env={DASHBOARD_ACCESS_MODE:'private',DASHBOARD_PUBLIC_ORIGIN:origin,DASHBOARD_ACCESS_USER:'fixture',DASHBOARD_ACCESS_PASSWORD:'synthetic-secret-only-fixture-password-at-least-32-characters'};
const authorization='Basic '+Buffer.from(env.DASHBOARD_ACCESS_USER+':'+env.DASHBOARD_ACCESS_PASSWORD).toString('base64');
function request(headers:Record<string,string>={}){
 return new Request('http://127.0.0.1:3000/api/settings',{headers:{host:'dashboard.fixture.ts.net',authorization,origin,...headers}});
}
test('Private access authenticates browser writes and rejects CSRF, host spoofing and missing passwords',()=>{
 assert.doesNotThrow(()=>assertApplicationRequest(request(),true,env));
 for(const headers of ([{authorization:''},{authorization:'Basic ZmFrZQ=='},{origin:'https://evil.example'},{origin:''},{host:'evil.example'},{'sec-fetch-site':'cross-site'}] as Record<string,string>[])){
  assert.throws(()=>assertApplicationRequest(request(headers),true,env));
 }
 assert.throws(()=>assertApplicationRequest(request(),false,{...env,DASHBOARD_ACCESS_PASSWORD:''}));
 assert.throws(()=>assertApplicationRequest(request({'x-forwarded-host':'dashboard.fixture.ts.net',host:'127.0.0.1:3000'}),false,env));
});
test('Private origin is exact HTTPS and local defaults never accept proxy identity as authentication',()=>{
 for(const value of ['http://dashboard.fixture.ts.net','https://example.com','https://dashboard.fixture.ts.net/path','https://user:invalid-synthetic-secret@dashboard.fixture.ts.net','https://dashboard.fixture.ts.net:3000']){
  assert.throws(()=>applicationOrigin({...env,DASHBOARD_PUBLIC_ORIGIN:value}));
 }
 assert.throws(()=>privateAccessConfig({...env,DASHBOARD_ACCESS_USER:'fixture:invalid'}));
 assert.throws(()=>applicationOrigin({DASHBOARD_ACCESS_MODE:'typo'}));
 assert.equal(applicationOrigin({}),'http://127.0.0.1:3000');
 assert.throws(()=>assertApplicationRequest(request({'tailscale-user-login':'fixture@example.com',authorization:''}),false,env));
 assert.throws(()=>assertApplicationRequest(new Request('http://evil.example/api/reports',{headers:{host:'evil.example'}}),false,{}));
});
test('Consistent backup includes WAL data, preserves source and refuses overwrite',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'eve-backup-')),source=path.join(dir,'source.sqlite'),destination=path.join(dir,'backup.sqlite');
 const db=new DatabaseSync(source);
 try{
  db.exec("PRAGMA journal_mode=WAL; PRAGMA user_version=5; CREATE TABLE evidence(value TEXT); INSERT INTO evidence VALUES ('fixture')");
  assert.deepEqual(backupDatabase(source,destination),{schemaVersion:5});
  const copy=new DatabaseSync(destination,{readOnly:true});
  try{assert.equal(copy.prepare('SELECT value FROM evidence').get()?.value,'fixture');}finally{copy.close();}
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM evidence').get()?.n,1);
  assert.throws(()=>backupDatabase(source,destination));
  assert.throws(()=>backupDatabase(source,source));
  assert.throws(()=>backupDatabase(path.join(dir,'missing.sqlite'),path.join(dir,'other.sqlite')));
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('Private database refuses undeclared replicas, seeds and network paths before opening',async()=>{
 const {getDatabase}=await import('../src/lib/db');
 const keys=['DASHBOARD_ACCESS_MODE','DASHBOARD_DATABASE_ROLE','DASHBOARD_DB','DASHBOARD_DEMO_SEED'];
 const prior=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 try{
  process.env.DASHBOARD_ACCESS_MODE='private';
  process.env.DASHBOARD_DB=path.join(tmpdir(),'never-created-private-fixture.sqlite');
  process.env.DASHBOARD_DEMO_SEED='0';
  delete process.env.DASHBOARD_DATABASE_ROLE;assert.throws(()=>getDatabase(),/explicit primary/);
  process.env.DASHBOARD_DATABASE_ROLE='development';assert.throws(()=>getDatabase(),/explicit primary/);
  process.env.DASHBOARD_DATABASE_ROLE='primary';process.env.DASHBOARD_DEMO_SEED='1';assert.throws(()=>getDatabase(),/explicit primary/);
  process.env.DASHBOARD_DEMO_SEED='0';process.env.DASHBOARD_DB='relative.sqlite';assert.throws(()=>getDatabase(),/explicit primary/);
  process.env.DASHBOARD_DB='\\\\fixture-server\\share\\db.sqlite';assert.throws(()=>getDatabase(),/explicit primary/);
 }finally{for(const key of keys){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}}
});
