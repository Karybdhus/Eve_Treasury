import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {NextRequest} from 'next/server';
import {POST as start} from '../src/app/api/auth/eve/start/route';
import {GET as callback} from '../src/app/api/auth/eve/callback/route';

for(const mode of ['local','private'])test('SSO cookie transport flags match '+mode+' origin without any live request',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'eve-order07-cookie-')),origin=mode==='private'?'https://fixture.treasury.ts.net':'http://127.0.0.1:3000';
 const values={DASHBOARD_DB:path.join(dir,'fixture.sqlite'),DASHBOARD_DEMO_SEED:'0',DASHBOARD_ACCESS_MODE:mode,DASHBOARD_DATABASE_ROLE:'primary',DASHBOARD_PUBLIC_ORIGIN:origin,DASHBOARD_ACCESS_USER:'fixture',DASHBOARD_ACCESS_PASSWORD:'synthetic-secret-only-fixture-cookie-password-at-least-32-characters',EVE_CLIENT_ID:'order07-fixture-client',EVE_CLIENT_SECRET:'',EVE_CALLBACK_URL:origin+'/api/auth/eve/callback',APPLICATION_SECRET:randomBytes(32).toString('hex'),TOKEN_ENCRYPTION_KEY:randomBytes(32).toString('base64')};
 const old=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]])),fetchBefore=globalThis.fetch;Object.assign(process.env,values);let requests=0;globalThis.fetch=async()=>{requests++;throw new Error('No network allowed in cookie fixture');};
 try{const headers={host:new URL(origin).host,origin,'Content-Type':'application/x-www-form-urlencoded',authorization:'Basic '+Buffer.from(values.DASHBOARD_ACCESS_USER+':'+values.DASHBOARD_ACCESS_PASSWORD).toString('base64')};const response=await start(new Request(origin+'/api/auth/eve/start',{method:'POST',headers,body:''}));assert.equal(response.status,303);assert.equal(new URL(response.headers.get('location')!).origin,'https://login.eveonline.com');const cookie=response.headers.get('set-cookie')!;assert.match(cookie,/eve_sso_state=/);assert.match(cookie,/HttpOnly/i);assert.match(cookie,/SameSite=lax/i);assert.equal(/;\s*Secure(?:;|$)/i.test(cookie),mode==='private');const result=await callback(new NextRequest(origin+'/api/auth/eve/callback?error=access_denied',{headers}));assert.match(result.headers.get('location')!,/sso_failed/);assert.equal(/;\s*Secure(?:;|$)/i.test(result.headers.get('set-cookie')!),mode==='private');assert.equal(requests,0);}
 finally{globalThis.fetch=fetchBefore;for(const key of Object.keys(values)){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}rmSync(dir,{recursive:true,force:true});}
});
