import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {generateKeyPair,SignJWT} from 'jose';
import {EsiClient,EsiError,parseEsiJson,type CacheStore,type EsiCache,type EsiResponse} from '../src/lib/esi/client';
import {encrypt,decrypt,stateCookie,verifyStateCookie} from '../src/lib/esi/crypto';
import {identityFromClaims,verifyAccessToken} from '../src/lib/esi/sso';
import {miningRecords,colonyRecords,journalRecords,jobRecords} from '../src/lib/esi/normalizers';
import {classifyJournal,rattingEvidence} from '../src/lib/esi/classification';
import {storeRecord,records,storeRaw} from '../src/lib/source-records';
import {openDatabase,importReports,readReports} from '../src/lib/db';
import {normalizeImport} from '../src/lib/report-standard';
import {freshness,dateKey} from '../src/lib/time';
import {funding,profit,weekly} from '../src/lib/accounting';
import {assertLocalRequest} from '../src/lib/esi/config';
function memoryCache():CacheStore{
 const data=new Map<string,EsiCache>(),blocked=new Map<string,number>();
 return {read:k=>data.get(k),write:(k,r)=>{data.set(k,r);},blockedUntil:g=>blocked.get(g)??0,block:(g,t)=>{blocked.set(g,t);}};
}
function response(data:unknown):EsiResponse{return {data,rawText:JSON.stringify(data),fetchedAt:'2026-10-08T00:00:00Z',pages:1,cached:false};}
const standard={schemaVersion:'1.0',reportId:'dddddddd-0000-4000-8000-000000000001',pillar:'mining',reportType:'daily',period:{from:'2026-10-04T00:00:00+02:00',to:'2026-10-04T23:59:59+02:00'},generatedAt:'2026-10-05T00:00:00+02:00',source:'agent',status:'actual',currency:'ISK',data:{totalFleetHours:2,outputs:[{typeId:1,name:'Ice',category:'ice',quantity:10,unit:'units'}],realizedRevenue:100,costs:10,netProfit:90,buybackReference:'buyback-proof-1'}};
test('Authenticated encryption binds ciphertext to the character and detects tampering',()=>{
 const key=randomBytes(32),value=encrypt('test-only-refresh-token','refresh:1',key);
 assert.equal(decrypt(value,'refresh:1',key),'test-only-refresh-token');
 assert.throws(()=>decrypt(value,'refresh:2',key));
 assert.throws(()=>decrypt(value.slice(0,-4)+'xxxx','refresh:1',key));
 assert.ok(!value.includes('test-only-refresh-token'));
});
test('Browser-bound state cookie rejects altered or mismatched state',()=>{
 const secret=randomBytes(32).toString('hex'),cookie=stateCookie('random-state',secret);
 assert.equal(verifyStateCookie('random-state',cookie,secret),true);
 assert.equal(verifyStateCookie('other-state',cookie,secret),false);
 assert.equal(verifyStateCookie('random-state',cookie+'x',secret),false);
});
test('JWT verification checks RSA signature, issuer, both audiences, expiry and character claims',async()=>{
 const {publicKey,privateKey}=await generateKeyPair('RS256'),client='test-client';
 const claims={name:'Test Character',owner:'test-owner',scp:['esi-wallet.read_character_wallet.v1']};
 const token=await new SignJWT(claims).setProtectedHeader({alg:'RS256'}).setIssuer('https://login.eveonline.com').setSubject('CHARACTER:EVE:1001').setAudience([client,'EVE Online']).setExpirationTime('5m').sign(privateKey);
 const identity=await verifyAccessToken(token,async()=>publicKey,client);
 assert.equal(identity.id,'1001');assert.equal(identity.scopes.length,1);
 await assert.rejects(()=>verifyAccessToken(token,async()=>publicKey,'wrong-client'));
 assert.throws(()=>identityFromClaims({...claims,sub:'CHARACTER:EVE:1001',aud:[client]},client),/audience/);
 const expired=await new SignJWT(claims).setProtectedHeader({alg:'RS256'}).setIssuer('https://login.eveonline.com').setSubject('CHARACTER:EVE:1001').setAudience([client,'EVE Online']).setExpirationTime(1).sign(privateKey);
 await assert.rejects(()=>verifyAccessToken(expired,async()=>publicKey,client));
});
test('ESI preserves int64 identities without rounding',()=>{
 const data=parseEsiJson('{"id":9223372036854775807,"quantity":12}') as {id:string;quantity:number};
 assert.equal(data.id,'9223372036854775807');assert.equal(data.quantity,12);
});
test('Central ESI client sets compatibility header and caches all pages',async()=>{
 const cache=memoryCache();let calls=0;
 const request:typeof fetch=async(input,init)=>{
  calls++;const url=new URL(String(input));assert.equal((init?.headers as Record<string,string>)['X-Compatibility-Date'],'2026-08-18');
  assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer test-only-access');
  return new Response(JSON.stringify([{page:url.searchParams.get('page')}]),{headers:{'x-pages':'2','cache-control':'max-age=600'}});
 };
 const client=new EsiClient('test-only-access','1001',cache,request,'2026-08-18');
 assert.equal((await client.pages('/characters/1001/mining','char-industry')).length,2);
 assert.equal((await client.pages('/characters/1001/mining','char-industry')).length,2);assert.equal(calls,2);
 await assert.rejects(()=>client.get('/characters/1002/mining','char-industry'),/Cross-character/);
});
test('ETag revalidation retains payload and pagination metadata',async()=>{
 const cache=memoryCache();let calls=0;
 const request:typeof fetch=async(_input,init)=>{
  calls++;if(calls===1)return new Response('[]',{headers:{ETag:'abc','x-pages':'2','cache-control':'max-age=0'}});
  assert.equal((init?.headers as Record<string,string>)['If-None-Match'],'abc');
  return new Response(null,{status:304,headers:{'cache-control':'max-age=600'}});
 };
 const client=new EsiClient('','1001',cache,request,'2026-08-18');
 const original=await client.get('/characters/1001/mining','char-industry');
 const row=await client.get('/characters/1001/mining','char-industry');
 assert.deepEqual(row.data,[]);assert.equal(row.pages,2);assert.equal(row.cached,true);assert.equal(row.fetchedAt,original.fetchedAt);assert.ok(Date.parse(row.checkedAt!)>=Date.parse(original.fetchedAt));const reused=await client.get('/characters/1001/mining','char-industry');assert.equal(reused.fetchedAt,original.fetchedAt);assert.equal(calls,2);
});
test('Rate limiting prevents a second network request',async()=>{
 let calls=0;const cache=memoryCache(),request:typeof fetch=async()=>{calls++;return new Response('{}',{status:429,headers:{'retry-after':'120'}});};
 const client=new EsiClient('','1001',cache,request);
 await assert.rejects(()=>client.get('/characters/1001/mining','char-industry'),EsiError);
 await assert.rejects(()=>client.get('/characters/1001/mining','char-industry'),EsiError);
 assert.equal(calls,1);
});
test('Transactions use a stable cursor until an empty response',async()=>{
 const cursors:string[]=[];const request:typeof fetch=async(input)=>{const url=new URL(String(input)),cursor=url.searchParams.get('from_id');cursors.push(cursor??'first');return new Response(cursor?'[]':'[{"transaction_id":9223372036854775807}]');};
 const client=new EsiClient('','1001',memoryCache(),request);
 assert.equal((await client.transactions('/characters/1001/wallet/transactions')).length,2);
 assert.deepEqual(cursors,['first','9223372036854775807']);
});
test('Mining quantity corrections replace the same bucket and never invent fleet hours',()=>{
 const db=openDatabase(':memory:');try{
  const first=miningRecords('1001',response([{date:'2026-10-05',type_id:1,solar_system_id:2,quantity:10}]))[0];
  const second=miningRecords('1001',response([{date:'2026-10-05',type_id:1,solar_system_id:2,quantity:15}]))[0];
  storeRecord(db,first);storeRecord(db,second);
  const rows=records(db,'mining_entry');assert.equal(rows.length,1);assert.equal(rows[0].data.quantity,15);assert.equal(rows[0].data.fleetHours,'not_reported');
 }finally{db.close();}
});
test('Raw source payloads are immutable while normalized job state can advance',()=>{
 const db=openDatabase(':memory:');try{
  const payload={job_id:1,activity_id:1,blueprint_type_id:2,runs:1,start_date:'2026-10-05T00:00:00Z',end_date:'2026-10-06T00:00:00Z',facility_id:3,status:'active'};
  const first=response([payload]),second=response([{...payload,status:'delivered'}]);
  for(const r of [first,second]){const rawId=storeRaw(db,{source:'esi',characterId:'1001',endpoint:'/jobs',fetchedAt:r.fetchedAt,payloadText:r.rawText});storeRecord(db,{...jobRecords('1001',r)[0],rawId});}
  assert.equal(records(db,'industry_job').length,1);assert.equal(records(db,'industry_job')[0].data.status,'delivered');
  assert.equal((db.prepare('SELECT COUNT(*) n FROM raw_source_records').get() as {n:number}).n,2);
 }finally{db.close();}
});
test('Colony freshness uses last_update, not the recent fetch timestamp',()=>{
 const raw={planet_id:1,owner_id:1001,solar_system_id:2,planet_type:'ice',upgrade_level:3,num_pins:1,last_update:'2026-10-01T00:00:00Z'};
 const rows=colonyRecords('1001',raw,response({pins:[{pin_id:'9223372036854775807',type_id:2,latitude:0,longitude:0,contents:[]}],links:[],routes:[]}));
 assert.equal(rows.length,2);assert.equal(rows[0].sourceTimestamp,raw.last_update);assert.equal(rows[0].data.storageUtilization,'unknown');
 assert.equal(freshness(rows[0].fetchedAt,rows[0].sourceTimestamp,Date.parse('2026-10-08T00:00:00Z')),'stale');
});
test('Bounty net uses journal deltas once; ESS and ambiguous transfers remain partial',()=>{
 const rows=journalRecords('1001',response([{id:1,date:'2026-10-05T00:00:00Z',ref_type:'bounty_prizes',description:'test',amount:90,tax:10},{id:2,date:'2026-10-05T00:00:00Z',ref_type:'ess_escrow_transfer',description:'test',amount:20}]));
 const result=rattingEvidence(rows,new Set(['1001']));
 assert.equal(result.measuredNet,90);assert.equal(result.essEntries,1);assert.equal(result.completeness,'partial');
 assert.equal(classifyJournal({ref_type:'player_donation',first_party_id:'1001',second_party_id:'1002'},new Set(['1001','1002'])).category,'internal_transfer');
 assert.equal(classifyJournal({ref_type:'player_donation',first_party_id:'1001',second_party_id:'9999'},new Set(['1001'])).category,'transfer_unresolved');
});
test('Drive standard accepts optional omissions and maps to Berlin periods and traceable profit',()=>{
 const r=normalizeImport(standard);assert.equal(r.report.reportingTimezone,'Europe/Berlin');assert.equal(profit(r.report),90);
 assert.equal(dateKey(r.report.period.from),'2026-10-04');
 const untraced=normalizeImport({...standard,data:{netProfit:90}});
 assert.equal(profit(untraced.report),'unknown');
});
test('Drive import preserves raw report and repeated imports stay idempotent',()=>{
 const db=openDatabase(':memory:');try{
  assert.equal(importReports(db,standard,'standard.json').imported,1);
  assert.equal(importReports(db,standard,'standard.json').skipped,1);
  const raw=db.prepare('SELECT raw_body FROM imported_source_reports').get() as {raw_body:string};
  assert.deepEqual(JSON.parse(raw.raw_body),standard);assert.equal(profit(readReports(db)[0].report),90);
 }finally{db.close();}
});
test('Seeds never enter V2 actual funding or weekly income',()=>{
 const r=normalizeImport({...standard,provenance:'historical_seed'}).report;
 assert.equal(profit(r),'not_reported');assert.equal(weekly([r],new Date('2026-10-04T21:59:59Z'))[0].knownSubtotal,'not_reported');
});
test('PLEX goal counts only allocated funds without fabricating global free liquidity',()=>{
 const r=normalizeImport({...standard,generatedAt:'2026-10-06T00:00:00Z',pillar:'plex_goal',reportType:'snapshot',period:{from:'2026-10-05T00:00:00Z',to:'2026-10-05T00:00:00Z'},data:{physicalPlex:260,iskAllocatedForPlex:500000000,plexPrice:{iskPerPlex:5000000,timestamp:'2026-10-05T00:00:00Z',source:'market-proof'}}}).report;
 assert.equal(funding([r],new Date('2026-10-05T12:00:00Z')).equivalent,360);assert.equal(funding([r],new Date('2026-10-05T12:00:00Z')).freeLiquidity,'not_reported');
 assert.deepEqual(funding([r],new Date('2026-10-05T12:00:00Z')).targets.map(t=>t.plex),[7875,13500]);
});
test('Local mutation boundary blocks missing origins and remote hosts',()=>{
 const good=new Request('http://127.0.0.1:3000/api/sessions',{headers:{origin:'http://127.0.0.1:3000'}});
 assert.doesNotThrow(()=>assertLocalRequest(good,true));
 assert.throws(()=>assertLocalRequest(new Request(good.url),true));
 assert.throws(()=>assertLocalRequest(new Request('http://evil.example/api/sessions',{headers:{origin:'http://evil.example'}}),true));
});

test('Original standard payload cannot change under an existing report ID',()=>{
 const db=openDatabase(':memory:');try{importReports(db,standard,'standard.json');assert.throws(()=>importReports(db,{...standard,data:{...standard.data,extraSourceNote:'changed'}},'standard.json'),/original content changed/);}finally{db.close();}
});
test('Stable transaction evidence cannot count as profit in two pillars',()=>{
 const db=openDatabase(':memory:');try{
  const mining={...standard,data:{...standard.data,sourceTransactionIds:['esi:1001:transaction:123']}};
  importReports(db,mining,'mining.json');
  const trading={...standard,reportId:'dddddddd-0000-4000-8000-000000000099',pillar:'trading',data:{realizedTradingProfit:10,sourceTransactionIds:['esi:1001:transaction:123']}};
  assert.throws(()=>importReports(db,trading,'trading.json'),/already used/);
  assert.equal(readReports(db).length,1);
 }finally{db.close();}
});
test('Berlin reporting days handle 23-hour and 25-hour DST transitions',()=>{
 for(const [from,to] of [['2026-03-29T00:00:00+01:00','2026-03-29T23:59:59+02:00'],['2026-10-25T00:00:00+02:00','2026-10-25T23:59:59+01:00']]){
  assert.doesNotThrow(()=>normalizeImport({...standard,status:'plan',period:{from,to}}));
 }
});


test('Transactions accept the inclusive terminal cursor without dropping history',async()=>{
 const cursors:string[]=[];
 const request:typeof fetch=async(input)=>{const cursor=new URL(String(input)).searchParams.get('from_id');cursors.push(cursor??'first');
  return Response.json((cursor==='9223372036854775805'?['9223372036854775805']:cursor?['9223372036854775806','9223372036854775805']:['9223372036854775807','9223372036854775806']).map(transaction_id=>({transaction_id})));};
 const client=new EsiClient('','1001',memoryCache(),request);
 const pages=await client.transactions('/characters/1001/wallet/transactions');
 assert.equal(pages.length,3);assert.deepEqual(cursors,['first','9223372036854775806','9223372036854775805']);
 assert.equal(new Set(pages.flatMap(p=>(p.data as {transaction_id:string}[]).map(r=>r.transaction_id))).size,3);
});

test('Transactions stop after a single initial record is echoed as the terminal cursor',async()=>{
 let calls=0;const request:typeof fetch=async()=>{calls++;return Response.json([{transaction_id:42}]);};
 const client=new EsiClient('','1001',memoryCache(),request);
 assert.equal((await client.transactions('/characters/1001/wallet/transactions')).length,2);assert.equal(calls,2);
});

test('Transactions still reject repeated multi-record or backward-moving cursor pages',async()=>{
 for(const second of [[{transaction_id:100},{transaction_id:99}],[{transaction_id:101}]]){
  let calls=0;const request:typeof fetch=async()=>Response.json(calls++===0?[{transaction_id:100},{transaction_id:99}]:second);
  const client=new EsiClient('','1001',memoryCache(),request);
  await assert.rejects(()=>client.transactions('/characters/1001/wallet/transactions'),/did not advance/);assert.equal(calls,2);
 }
});
