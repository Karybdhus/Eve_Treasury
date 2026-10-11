import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {NextRequest} from 'next/server';
import {getDatabase} from '../src/lib/db';
import {ESI_SCOPES,configIssues,configuredScopes} from '../src/lib/esi/config';
import {beginAuthorization,completeAuthorization,accessToken} from '../src/lib/esi/sso';
import {decrypt} from '../src/lib/esi/crypto';
import {GET as callback} from '../src/app/api/auth/eve/callback/route';

test('Public PKCE uses exact scopes, client ID, encrypted state and secret-free token exchange',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'eve-sso-order04-'));
 const keys=['DASHBOARD_DB','DASHBOARD_DEMO_SEED','DASHBOARD_ACCESS_MODE','EVE_CLIENT_ID','EVE_CLIENT_SECRET','EVE_CALLBACK_URL','EVE_SSO_SCOPES','APPLICATION_SECRET','TOKEN_ENCRYPTION_KEY'];
 const prior=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 const originalFetch=globalThis.fetch;
 Object.assign(process.env,{DASHBOARD_DB:path.join(dir,'isolated.sqlite'),DASHBOARD_DEMO_SEED:'0',DASHBOARD_ACCESS_MODE:'local',EVE_CLIENT_ID:'98cef912fcf7418d99c7fc2198be33b4',EVE_CALLBACK_URL:'http://127.0.0.1:3000/api/auth/eve/callback',APPLICATION_SECRET:randomBytes(32).toString('hex'),TOKEN_ENCRYPTION_KEY:randomBytes(32).toString('base64')});
 delete process.env.EVE_CLIENT_SECRET;delete process.env.EVE_SSO_SCOPES;
 try{
  assert.deepEqual(configIssues(),[]);
  const expected=['esi-contracts.read_character_contracts.v1','esi-industry.read_character_mining.v1','esi-planets.manage_planets.v1','esi-wallet.read_character_wallet.v1','esi-industry.read_character_jobs.v1','esi-markets.read_character_orders.v1','esi-skills.read_skills.v1','esi-skills.read_skillqueue.v1','esi-clones.read_implants.v1','esi-assets.read_assets.v1'];
  assert.deepEqual(configuredScopes().sort(),expected.sort());
  const flow=beginAuthorization(),url=new URL(flow.url),p=url.searchParams;
  assert.equal(url.origin,'https://login.eveonline.com');assert.equal(p.get('client_id'),process.env.EVE_CLIENT_ID);
  assert.equal(p.get('redirect_uri'),process.env.EVE_CALLBACK_URL);assert.equal(p.get('response_type'),'code');
  assert.equal(p.get('code_challenge_method'),'S256');assert.deepEqual(p.get('scope')!.split(' ').sort(),expected);
  const db=getDatabase();let verifier:string;
  try{const row=db.prepare('SELECT state_hash,verifier_cipher FROM oauth_states').get() as {state_hash:string;verifier_cipher:string};
   assert.equal(row.state_hash,createHash('sha256').update(flow.state).digest('hex'));
   verifier=decrypt(row.verifier_cipher,'oauth:'+row.state_hash);
   assert.equal(p.get('code_challenge'),createHash('sha256').update(verifier).digest('base64url'));
   assert.ok(!row.verifier_cipher.includes(verifier));
  }finally{db.close();}
  let exchanges=0;
  globalThis.fetch=async(input,init)=>{
   assert.equal(String(input),'https://login.eveonline.com/v2/oauth/token');assert.equal(init?.method,'POST');
   assert.equal(new Headers(init?.headers).has('Authorization'),false);
   const body=init?.body as URLSearchParams;assert.equal(body.get('client_id'),process.env.EVE_CLIENT_ID);assert.equal(body.has('client_secret'),false);
   if(exchanges===0){assert.equal(body.get('grant_type'),'authorization_code');assert.equal(body.get('code_verifier'),verifier);assert.equal(body.get('redirect_uri'),process.env.EVE_CALLBACK_URL);}
   else {assert.equal(body.get('grant_type'),'refresh_token');assert.equal(body.get('refresh_token'),'synthetic-secret-only-fixture-refresh');}
   exchanges++;return Response.json({access_token:'synthetic-secret-only-fixture-access-'+exchanges,refresh_token:'synthetic-secret-only-fixture-refresh',expires_in:1200});
  };
  const identity={id:'1001',name:'Fixture Character',ownerHash:'fixture-owner',scopes:Object.values(ESI_SCOPES)};
  const deps={verifyToken:async()=>identity};
  assert.equal(await completeAuthorization(flow.state,'fixture-code',deps),'1001');
  await assert.rejects(()=>completeAuthorization(flow.state,'fixture-code',deps),/reused/);
  const expire=getDatabase();try{expire.prepare('UPDATE encrypted_credentials SET expires_at=0').run();}finally{expire.close();}
  assert.equal(await accessToken('1001',deps),'synthetic-secret-only-fixture-access-2');
  const repeat=beginAuthorization('1001');
  await completeAuthorization(repeat.state,'fixture-code',{requestTokens:async()=>({access_token:'synthetic-secret-only-fixture-repeat',refresh_token:'synthetic-secret-only-synthetic-secret-only-fixture-repeat-refresh',expires_in:1200}),verifyToken:deps.verifyToken});
  const saved=getDatabase();try{
   assert.equal((saved.prepare('SELECT COUNT(*) n FROM characters').get() as {n:number}).n,1);
   assert.equal((saved.prepare('SELECT COUNT(*) n FROM reports').get() as {n:number}).n,0);
   const encrypted=saved.prepare('SELECT access_cipher FROM encrypted_credentials').get() as {access_cipher:string};assert.equal(decrypt(encrypted.access_cipher,'access:1001'),'synthetic-secret-only-fixture-repeat');
  }finally{saved.close();}
  for(const query of ['error=access_denied','state=fixture-state&code=fixture-code','']){
   const result=await callback(new NextRequest(process.env.EVE_CALLBACK_URL+'?'+query));
   assert.equal(result.status,303);assert.equal(result.headers.get('location'),'http://127.0.0.1:3000/characters?error=sso_failed');
   assert.equal(result.headers.get('cache-control'),'no-store');assert.equal(result.headers.get('referrer-policy'),'no-referrer');
   assert.ok(!result.headers.get('location')!.includes('fixture-code'));
  }
  assert.equal(exchanges,2);
 }finally{
  globalThis.fetch=originalFetch;
  for(const k of keys){if(prior[k]===undefined)delete process.env[k];else process.env[k]=prior[k];}
  rmSync(dir,{recursive:true,force:true});
 }
});
