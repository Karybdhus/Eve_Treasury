import {defaultSettings} from '../src/lib/settings';
import {request as httpRequest} from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,existsSync,readdirSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:net';
import {once} from 'node:events';
test('All views work with an empty database; local forms save; agent API excludes secrets', {skip:!existsSync('.next/BUILD_ID'),timeout:45000},async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'eve-runtime-')),probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const address=probe.address();assert.ok(address&&typeof address==='object');const port=address.port;probe.close();await once(probe,'close');
 const origin='http://127.0.0.1:'+port,readKey='runtime-test-key-that-is-only-a-fixture';
 const child=spawn(process.execPath,[path.resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{cwd:process.cwd(),windowsHide:true,stdio:'ignore',env:{...process.env,DASHBOARD_DB:path.join(dir,'empty.sqlite'),DASHBOARD_DEMO_SEED:'0',EVE_CLIENT_ID:'',EVE_CALLBACK_URL:origin+'/api/auth/eve/callback',TOKEN_ENCRYPTION_KEY:'',APPLICATION_SECRET:'',AGENT_READ_API_KEY:readKey}});
 try{
  let ready=false;for(let i=0;i<100;i++){try{const r=await fetch(origin+'/overview');if(r.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(ready,'Isolated server did not start');
  for(const view of ['overview','plex','weekly','mining','pi','trading','industry','contracts','supplementary','buyback','characters','insights','imports','settings','sessions']){const response=await fetch(origin+'/'+view);assert.equal(response.status,200,view);}
  assert.equal((await fetch(origin+'/api/reports')).status,200);const initial=await(await fetch(origin+'/api/reports')).json();assert.equal(initial.reports?.length??initial.length,0);
  assert.equal((await fetch(origin+'/api/buyback',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
  const booking={weekStart:'2026-10-05',reportingStatus:'confirmed_payout',actualPayoutISK:'900',payoutDate:'2026-10-07',lines:[{category:'ore_ice',actualPayoutISK:'600'},{category:'pi',actualPayoutISK:'300'}]};
  const saved=await fetch(origin+'/api/buyback',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({action:'save',booking})});assert.equal(saved.status,200);const b=await saved.json();assert.equal(b.actualPayoutISK,'900.00');
  const fleetResponse=await fetch(origin+'/api/fleet',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({action:'start',session:{characters:[{name:'Offline runtime pilot A'},{name:'Offline runtime pilot B'}]}})});assert.equal(fleetResponse.status,200);const fleet=await fleetResponse.json();
  const settings=structuredClone(defaultSettings);
  const settingsWrite=await fetch(origin+'/api/settings',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({...settings,sources:{...settings.sources,manual:false}})});assert.equal(settingsWrite.status,200);
  const miningHtml=await(await fetch(origin+'/mining')).text();assert.ok(miningHtml.includes('Offline runtime pilot A'),'Active fleet remains visible even when manual accounting source is disabled');
  const fleetEnd=await fetch(origin+'/api/fleet',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({action:'end',sessionId:fleet.sessionId})});assert.equal(fleetEnd.status,200);const endedFleet=await fleetEnd.json();assert.equal(endedFleet.characterHours,endedFleet.fleetHours*2);
  await fetch(origin+'/api/settings',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(settings)});
  assert.equal((await fetch(origin+'/api/analytics')).status,401);const response=await fetch(origin+'/api/analytics',{headers:{'x-dashboard-api-key':readKey}});assert.equal(response.status,200);const data=await response.json();assert.equal(data.buybackRevenue.revenueISK,'900.00');assert.equal(data.consolidated.buybackRevenueISK,'900.00');
  const filtered=await(await fetch(origin+'/api/reconciliation?from=2026-10-07&to=2026-10-07&source=buyback')).json();assert.equal(filtered.summary.buybackRevenueISK,'900.00');
  const agentFiltered=await(await fetch(origin+'/api/analytics?from=2026-10-07&to=2026-10-07&source=buyback',{headers:{'x-dashboard-api-key':readKey}})).json();assert.deepEqual(agentFiltered.consolidated,filtered.summary);
  const html=await(await fetch(origin+'/overview?from=2026-10-07&to=2026-10-07&source=buyback')).text();assert.ok(html.includes('Earnings by Activity'));assert.ok(html.includes('Ungeklaerte Zufluesse'));assert.ok(html.includes('Wallet Trajectory'));assert.ok(/900(?:<!-- -->)?(?:,00)?(?:<!-- -->)? ISK/.test(html)||html.includes('900,00'), 'Expected filtered exact buyback amount in UI');
  for(const [query,status] of [['kind=imports&page=-1',400],['kind=imports&page=1.5',400],['kind=bad',400],['kind=report&key=missing',404],['kind=asset_positions&key=missing',404],['kind=source&key=missing',404]] as const)assert.equal((await fetch(origin+'/api/display-data?'+query)).status,status);assert.equal((await fetch(origin+'/api/display-data?kind=imports',{headers:{'sec-fetch-site':'cross-site'}})).status,403);
  const importsResponse=await fetch(origin+'/imports');assert.equal(importsResponse.status,200);const importsHtml=await importsResponse.text();assert.ok(!importsHtml.includes('This page couldn')&&!importsHtml.includes('Only plain objects'));assert.ok(!importsHtml.includes(b.bookingId),'Evidence is deferred, not embedded in initial HTML');assert.ok(importsHtml.includes('Technischer Finanzabgleich'));const journal=await(await fetch(origin+'/api/display-data?kind=journal')).json();assert.ok(journal.rows.length<=25);assert.ok(!JSON.stringify(journal).includes(readKey));const review=await(await fetch(origin+'/api/display-data?kind=review')).json();assert.ok(review.sources.some((s:{sourceId:string;raw:unknown})=>s.sourceId===b.bookingId&&s.raw===null));const evidence=await(await fetch(origin+'/api/display-data?kind=source&key='+encodeURIComponent('buyback:'+b.bookingId))).json();assert.equal(evidence.raw.bookingId,b.bookingId);
  assert.equal((await fetch(origin+'/api/reconciliation',{method:'POST',body:'{}'})).status,403);
  const edits=await Promise.all(['first concurrent edit','second concurrent edit'].map(notes=>fetch(origin+'/api/buyback',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({action:'save',booking:{...booking,bookingId:b.bookingId,expectedRevision:b.revision,notes}})})));
  assert.deepEqual(edits.map(r=>r.status).sort(),[200,400]);
const raw=JSON.stringify(data);assert.ok(!raw.includes(readKey));assert.ok(!/access_cipher|refresh_cipher|access_token|refresh_token|owner_hash/.test(raw));
 }finally{
  if(child.exitCode===null){const stopped=once(child,'close');child.kill();await stopped;}
  for(const name of readdirSync(dir))unlinkSync(path.join(dir,name));rmdirSync(dir);
 }
});

function fixtureFetch(url:string,init:RequestInit={}):Promise<Response>{
 return new Promise((resolve,reject)=>{
  const request=httpRequest(url,{method:init.method??'GET',headers:Object.fromEntries(new Headers(init.headers))},response=>{
   const chunks:Buffer[]=[];response.on('data',chunk=>chunks.push(Buffer.from(chunk)));response.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:response.statusCode,headers:response.headers as Record<string,string>})));response.on('error',reject);
  });request.on('error',reject);request.end(init.body??undefined);
 });
}
test('Prepared private mode protects pages and APIs over an isolated local production server',{skip:!existsSync('.next/BUILD_ID'),timeout:45000},async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'eve-private-runtime-')),probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const address=probe.address();assert.ok(address&&typeof address==='object');const port=address.port;probe.close();await once(probe,'close');
 const local='http://127.0.0.1:'+port,origin='https://dashboard.fixture.ts.net',password='synthetic-secret-only-private-runtime-fixture-password-32-characters';
 const authorization='Basic '+Buffer.from('fixture:'+password).toString('base64');
 const headers={host:'dashboard.fixture.ts.net',authorization,origin};
 const child=spawn(process.execPath,[path.resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{cwd:process.cwd(),windowsHide:true,stdio:'ignore',env:{...process.env,DASHBOARD_ACCESS_MODE:'private',DASHBOARD_PUBLIC_ORIGIN:origin,DASHBOARD_ACCESS_USER:'fixture',DASHBOARD_ACCESS_PASSWORD:password,DASHBOARD_DATABASE_ROLE:'primary',DASHBOARD_DB:path.join(dir,'empty.sqlite'),DASHBOARD_DEMO_SEED:'0',EVE_CLIENT_ID:'',EVE_CALLBACK_URL:origin+'/api/auth/eve/callback',TOKEN_ENCRYPTION_KEY:'',APPLICATION_SECRET:'',AGENT_READ_API_KEY:'synthetic-secret-only-synthetic-secret-only-private-agent-fixture-key-at-least-32'}});
 try{
  let ready=false,last='';for(let i=0;i<100;i++){try{const r=await fixtureFetch(local+'/overview',{headers});last=String(r.status)+' '+(await r.text()).slice(0,200);if(r.ok){ready=true;break;}}catch(e){last=String(e);}await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(ready,'Private fixture server did not start: '+last);
  for(const view of ['overview','plex','weekly','mining','pi','trading','industry','contracts','supplementary','buyback','characters','insights','imports','settings','sessions']){
   assert.equal((await fixtureFetch(local+'/'+view,{headers})).status,['supplementary','insights','buyback'].includes(view)?307:200,view);
   const rejected=await fixtureFetch(local+'/'+view,{headers:{host:headers.host}});
   assert.equal(rejected.status,401,view);assert.ok(rejected.headers.get('www-authenticate')?.startsWith('Basic'));
  }
  assert.equal((await fixtureFetch(local+'/api/reports',{headers:{host:headers.host}})).status,401);
  assert.equal((await fixtureFetch(local+'/api/display-data?kind=imports',{headers:{host:headers.host}})).status,401);
  assert.equal((await fixtureFetch(local+'/api/display-data?kind=imports',{headers})).status,200);
  assert.equal((await fixtureFetch(local+'/api/display-data?kind=imports',{headers:{...headers,'sec-fetch-site':'cross-site'}})).status,403);
  assert.equal((await fixtureFetch(local+'/api/reports',{headers:{...headers,authorization:'Basic ZmFrZQ=='}})).status,401);
  assert.equal((await fixtureFetch(local+'/api/reports',{headers:{...headers,host:'evil.example'}})).status,403);
  assert.equal((await fixtureFetch(local+'/api/analytics',{headers})).status,401,'Agent requires its additional read key');
  assert.equal((await fixtureFetch(local+'/api/analytics',{headers:{...headers,'x-dashboard-api-key':'synthetic-secret-only-synthetic-secret-only-private-agent-fixture-key-at-least-32'}})).status,200);
  const booking={weekStart:'2026-10-05',reportingStatus:'confirmed_payout',actualPayoutISK:'100',payoutDate:'2026-10-07',lines:[{category:'ore_ice',actualPayoutISK:'100'}]};
  for(const badHeaders of [{...headers,origin:'https://evil.example'},{host:headers.host,authorization},{...headers,'sec-fetch-site':'cross-site'}]){
   assert.equal((await fixtureFetch(local+'/api/buyback',{method:'POST',headers:{...badHeaders,'Content-Type':'application/json'},body:JSON.stringify({action:'save',booking})})).status,403);
  }
  const saved=await fixtureFetch(local+'/api/buyback',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({action:'save',booking})});
  assert.equal(saved.status,200);assert.equal((await saved.json()).actualPayoutISK,'100.00');
  assert.equal(saved.headers.get('cache-control'),'private, no-store');
 }finally{
  if(child.exitCode===null){const stopped=once(child,'close');child.kill();await stopped;}
  for(const name of readdirSync(dir))unlinkSync(path.join(dir,name));rmdirSync(dir);
 }
});
