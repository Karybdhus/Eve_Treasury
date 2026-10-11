import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,unlinkSync,rmdirSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {getDatabase,openDatabase,readReports} from '../src/lib/db';
import {records} from '../src/lib/source-records';
import {EsiClient,type EsiResponse} from '../src/lib/esi/client';
import {syncCharacter,listCharacters} from '../src/lib/esi/sync';
import {ESI_SCOPES} from '../src/lib/esi/config';
import {saveAuthorization,disconnect,beginAuthorization,accessToken,completeAuthorization} from '../src/lib/esi/sso';
import {startSession,endSession} from '../src/lib/manual-sessions';
function cleanup(dir:string){for(const name of readdirSync(dir))unlinkSync(path.join(dir,name));rmdirSync(dir);}
function fakeResponse(data:unknown):EsiResponse{return {data,rawText:JSON.stringify(data),fetchedAt:new Date().toISOString(),pages:1,cached:false};}
class FixtureClient extends EsiClient{
 quantity=10;failPi=false;
 constructor(readonly id:string){super('',id);}
 override async get(p:string):Promise<EsiResponse>{
  if(p.endsWith('/contracts'))return fakeResponse([]);
  if(p.endsWith('/mining'))return fakeResponse([{date:'2026-10-05',type_id:10,solar_system_id:20,quantity:this.quantity}]);
  if(p.endsWith('/planets')){
   if(this.failPi)throw new Error('ESI temporarily unavailable');
   return fakeResponse([{planet_id:30,owner_id:this.id,solar_system_id:20,planet_type:'ice',upgrade_level:3,num_pins:1,last_update:'2026-10-01T00:00:00Z'}]);
  }
  if(p.endsWith('/planets/30'))return fakeResponse({pins:[{pin_id:'9223372036854775807',type_id:40,latitude:0,longitude:0}],links:[],routes:[]});
  if(p.endsWith('/wallet'))return fakeResponse(1000);
  if(p.endsWith('/wallet/journal'))return fakeResponse([{id:'9223372036854775807',ref_type:'bounty_prizes',date:'2026-10-05T00:00:00Z',description:'fixture',amount:90,tax:10}]);
  if(p.endsWith('/wallet/transactions'))return fakeResponse([]);
  if(p.endsWith('/industry/jobs'))return fakeResponse([{job_id:50,activity_id:1,blueprint_type_id:60,product_type_id:70,runs:2,cost:5,status:'active',start_date:'2026-10-05T00:00:00Z',end_date:'2026-10-06T00:00:00Z',facility_id:80}]);
  if(p.endsWith('/orders'))return fakeResponse([{order_id:90,type_id:70,price:100,volume_remain:2,is_corporation:false,is_buy_order:false,issued:'2026-10-05T00:00:00Z'}]);
  if(p.endsWith('/assets'))return fakeResponse([{item_id:'9223372036854775806',type_id:100,quantity:5,location_id:200,location_type:'station',location_flag:'Hangar',is_singleton:false}]);
  if(p.endsWith('/skills'))return fakeResponse({total_sp:10000,unallocated_sp:0,skills:[{skill_id:2495,active_skill_level:3,trained_skill_level:3,skillpoints_in_skill:8000}]});
  if(p.endsWith('/skillqueue'))return fakeResponse([{skill_id:2495,queue_position:0,finished_level:4,start_date:'2026-10-08T00:00:00Z',finish_date:'2026-10-09T00:00:00Z'}]);
  if(p.endsWith('/attributes'))return fakeResponse({charisma:20,intelligence:20,memory:20,perception:20,willpower:20});
  if(p.endsWith('/implants'))return fakeResponse([]);
  if(p.startsWith('/universe/types/'))return fakeResponse({type_id:Number(p.split('/').at(-1)),name:'Fixture skill'});
  throw new Error('Fixture endpoint unavailable');
 }
}
test('Existing V1 database migrates additively, with backup and unchanged reports',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'eve-migration-')),filename=path.join(dir,'v1.sqlite');
 const legacy=new DatabaseSync(filename),raw=readFileSync('seed/01-coordinator.json','utf8');
 legacy.exec('CREATE TABLE reports(report_id TEXT PRIMARY KEY,scope_key TEXT UNIQUE NOT NULL,body TEXT NOT NULL,imported_at TEXT NOT NULL,filename TEXT NOT NULL);PRAGMA user_version=1;');
 legacy.prepare('INSERT INTO reports VALUES (?,?,?,?,?)').run('26000000-0000-4000-8000-000000000001','old-scope',raw,'2026-10-04T00:00:00Z','seed.json');legacy.close();
 const db=openDatabase(filename);
 try{
  assert.equal((db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version,8);
  assert.equal((db.prepare('SELECT body FROM reports').get() as {body:string}).body,raw);
  assert.equal(readReports(db).length,1);assert.equal(existsSync(filename+'.pre-v2.sqlite'),true);
 }finally{db.close();cleanup(dir);}
});
test('Multi-character sync, repeat sync, source failure, manual session and disconnect preserve integrity',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'eve-sync-'));
 const previous={db:process.env.DASHBOARD_DB,key:process.env.TOKEN_ENCRYPTION_KEY,secret:process.env.APPLICATION_SECRET,client:process.env.EVE_CLIENT_ID,callback:process.env.EVE_CALLBACK_URL};
 process.env.DASHBOARD_DB=path.join(dir,'sync.sqlite');
 process.env.TOKEN_ENCRYPTION_KEY=randomBytes(32).toString('base64');
 process.env.APPLICATION_SECRET=randomBytes(32).toString('hex');
 process.env.EVE_CLIENT_ID='test-only-client';
 process.env.EVE_CALLBACK_URL='http://127.0.0.1:3000/api/auth/eve/callback';
 try{
  for(const id of ['1001','1002'])saveAuthorization({id,name:'Test '+id,ownerHash:'test-only-owner',scopes:Object.values(ESI_SCOPES)},{access_token:'test-only-access-'+id,refresh_token:'test-only-refresh-'+id,expires_in:1200});
  const a=new FixtureClient('1001'),b=new FixtureClient('1002');
  assert.equal((await syncCharacter('1001',{client:a})).results.pi.status,'success');
  await syncCharacter('1002',{client:b});
  a.quantity=15;await syncCharacter('1001',{client:a});
  let db=getDatabase();
  try{
   const mining=records(db,'mining_entry');assert.equal(mining.length,2);assert.equal(mining.find(r=>r.sourceCharacterId==='1001')?.data.quantity,15);
   assert.equal(records(db,'pi_colony').length,2);assert.equal(records(db,'industry_job').length,2);
   assert.equal(records(db,'wallet_journal').length,2);assert.equal(records(db,'asset_snapshot').length,2);assert.equal(records(db,'skill_snapshot').length,2);assert.equal(records(db,'skill_queue').length,2);assert.equal(records(db,'character_attributes').length,2);
   const credentials=db.prepare('SELECT * FROM encrypted_credentials').all() as {access_cipher:string;refresh_cipher:string}[];
   assert.ok(credentials.every(c=>!c.access_cipher.includes('test-only-access')&&!c.refresh_cipher.includes('test-only-refresh')));
   assert.equal(readReports(db).length,4);assert.ok(listCharacters().every(c=>c.last_sync));
  }finally{db.close();}
  a.failPi=true;const partial=await syncCharacter('1001',{client:a});assert.equal(partial.results.pi.status,'error');
  db=getDatabase();try{assert.equal(records(db,'pi_colony').length,2);}finally{db.close();}
  const sessionId=startSession({type:'mining',characterId:'1001',notes:'Test fixture'});assert.throws(()=>startSession({type:'hacking',characterId:'1001'}),/already running/);
  endSession(sessionId);endSession(sessionId);
  db=getDatabase();try{assert.equal(records(db,'manual_session')[0].data.fleetHours,'not_reported');}finally{db.close();}
  const flow=beginAuthorization('1001');assert.equal(new URL(flow.url).searchParams.get('code_challenge_method'),'S256');
  assert.ok(!flow.url.includes('test-only-refresh'));
  assert.equal(await accessToken('1001'),'test-only-access-1001');
  let stateUse=0;
  const dependencies={requestTokens:async(body:URLSearchParams)=>{stateUse++;assert.equal(body.get('grant_type'),'authorization_code');assert.ok((body.get('code_verifier')??'').length>=43);return {access_token:'test-only-new-access',refresh_token:'test-only-new-refresh',expires_in:1200};},verifyToken:async()=>({id:'1001',name:'Test 1001',ownerHash:'test-only-owner',scopes:Object.values(ESI_SCOPES)})};
  assert.equal(await completeAuthorization(flow.state,'test-only-code',dependencies),'1001');
  await assert.rejects(()=>completeAuthorization(flow.state,'test-only-code',dependencies),/reused/);
  assert.equal(stateUse,1);
  db=getDatabase();try{db.prepare('UPDATE encrypted_credentials SET expires_at=0 WHERE character_id=?').run('1001');}finally{db.close();}
  assert.equal(await accessToken('1001',{requestTokens:async(body)=>{assert.equal(body.get('grant_type'),'refresh_token');assert.equal(body.get('refresh_token'),'test-only-new-refresh');return {access_token:'test-only-rotated-access',refresh_token:'test-only-rotated-refresh',expires_in:1200};},verifyToken:dependencies.verifyToken}),'test-only-rotated-access');
  assert.equal(await accessToken('1001'),'test-only-rotated-access');
  const mismatch=beginAuthorization('1001');
  await assert.rejects(()=>completeAuthorization(mismatch.state,'test-only-code',{requestTokens:async()=>({access_token:'test-only-other',refresh_token:'test-only-other',expires_in:1200}),verifyToken:async()=>({id:'1002',name:'Test 1002',ownerHash:'test-only-owner',scopes:[]})}),/same character/);
  db=getDatabase();try{db.prepare('UPDATE encrypted_credentials SET expires_at=0 WHERE character_id=?').run('1001');}finally{db.close();}
  await assert.rejects(()=>accessToken('1001',{requestTokens:async()=>{disconnect('1001');return {access_token:'test-only-expired',refresh_token:'test-only-expired',expires_in:1200};},verifyToken:dependencies.verifyToken}),/changed during refresh/);
  disconnect('1001');
  db=getDatabase();try{
   assert.equal((db.prepare('SELECT COUNT(*) n FROM encrypted_credentials WHERE character_id=?').get('1001') as {n:number}).n,0);
   assert.equal(records(db,'mining_entry').length,2);
  }finally{db.close();}
  await assert.rejects(()=>accessToken('1001'),/not connected/);
  await assert.rejects(()=>syncCharacter('1001',{client:a}),/not connected/);
 }finally{
  for(const [key,value] of [['DASHBOARD_DB',previous.db],['TOKEN_ENCRYPTION_KEY',previous.key],['APPLICATION_SECRET',previous.secret],['EVE_CLIENT_ID',previous.client],['EVE_CALLBACK_URL',previous.callback]]){
   if(value===undefined)delete process.env[key!];else process.env[key!]=value;
  }
  cleanup(dir);
 }
});
