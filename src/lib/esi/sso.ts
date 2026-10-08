import {randomBytes,randomUUID} from 'node:crypto';
import {createRemoteJWKSet,jwtVerify,type JWTVerifyGetKey,type JWTPayload} from 'jose';
import {z} from 'zod';
import {getDatabase} from '../db';
import {sha} from '../source-records';
import {configuredScopes,ssoConfig} from './config';
import {encrypt,decrypt} from './crypto';
const AUTH='https://login.eveonline.com/v2/oauth/authorize';
const TOKEN='https://login.eveonline.com/v2/oauth/token';
const METADATA='https://login.eveonline.com/.well-known/oauth-authorization-server';
const tokens=z.object({access_token:z.string().min(1),refresh_token:z.string().min(1),expires_in:z.number().positive()});
let jwks:JWTVerifyGetKey|undefined,metadataExpires=0;
async function getKeys(){
 if(jwks&&metadataExpires>Date.now())return jwks;
 const res=await fetch(METADATA,{cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw new Error('SSO metadata is unavailable');
 const meta=await res.json();
 const url=new URL(meta.jwks_uri);
 if(url.protocol!=='https:'||url.hostname!=='login.eveonline.com')throw new Error('Unexpected SSO JWKS endpoint');
 jwks=createRemoteJWKSet(url);metadataExpires=Date.now()+300000;return jwks;
}
export function identityFromClaims(payload:JWTPayload,clientId:string){
 const audience=Array.isArray(payload.aud)?payload.aud:[payload.aud];
 if(!audience.includes(clientId)||!audience.includes('EVE Online'))throw new Error('SSO audience mismatch');
 const match=/^CHARACTER:EVE:(\d+)$/.exec(payload.sub??'');
 if(!match||typeof payload.name!=='string'||typeof payload.owner!=='string')throw new Error('SSO character claims are incomplete');
 const scopes=Array.isArray(payload.scp)?payload.scp.filter((s):s is string=>typeof s==='string'):typeof payload.scp==='string'?payload.scp.split(' '):[];
 return {id:match[1],name:payload.name,ownerHash:sha(payload.owner),scopes};
}
export async function verifyAccessToken(token:string,key?:JWTVerifyGetKey,clientId=ssoConfig().clientId){
 const {payload}=await jwtVerify(token,key??await getKeys(),{algorithms:['RS256'],issuer:['https://login.eveonline.com','https://login.eveonline.com/','login.eveonline.com'],audience:clientId,requiredClaims:['exp','sub','aud','iss'],clockTolerance:5});
 return identityFromClaims(payload,clientId);
}
async function tokenRequest(body:URLSearchParams){
 const config=ssoConfig(),headers:Record<string,string>={'Content-Type':'application/x-www-form-urlencoded'};
 if(config.clientSecret)headers.Authorization='Basic '+Buffer.from(config.clientId+':'+config.clientSecret).toString('base64');
 else body.set('client_id',config.clientId);
 const response=await fetch(TOKEN,{method:'POST',headers,body,signal:AbortSignal.timeout(15000),cache:'no-store'});
 if(!response.ok)throw new Error(response.status===400||response.status===401?'SSO authorization expired or revoked; reauthorize this character':'SSO token service temporarily unavailable');
 return tokens.parse(await response.json());
}
export function beginAuthorization(expectedCharacterId?:string){
 const config=ssoConfig(),state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
 const db=getDatabase();
 try{
  if(expectedCharacterId&&!db.prepare('SELECT character_id FROM characters WHERE character_id=?').get(expectedCharacterId))throw new Error('Unknown character');
  db.prepare('DELETE FROM oauth_states WHERE expires_at<?').run(Date.now());
  db.prepare('INSERT INTO oauth_states VALUES (?,?,?,?)').run(sha(state),encrypt(verifier,'oauth:'+sha(state)),Date.now()+600000,expectedCharacterId??null);
 }finally{db.close();}
 const url=new URL(AUTH);url.search=new URLSearchParams({response_type:'code',client_id:config.clientId,redirect_uri:config.callbackUrl,scope:configuredScopes().join(' '),state,code_challenge:Buffer.from(sha(verifier),'hex').toString('base64url'),code_challenge_method:'S256'}).toString();
 return {state,url:url.toString()};
}
export type TokenSet={access_token:string;refresh_token:string;expires_in:number};
export type SsoDependencies={requestTokens?:(body:URLSearchParams)=>Promise<TokenSet>;verifyToken?:(token:string)=>Promise<{id:string;name:string;ownerHash:string;scopes:string[]}>};
export async function completeAuthorization(state:string,code:string,dependencies:SsoDependencies={}){
 const config=ssoConfig(),db=getDatabase();let verifier:string,expected:string|undefined;
 try{
  db.exec('BEGIN IMMEDIATE');
  const row=db.prepare('SELECT * FROM oauth_states WHERE state_hash=?').get(sha(state)) as {verifier_cipher:string;expires_at:number;expected_character_id?:string}|undefined;
  if(!row||row.expires_at<Date.now()){db.exec('ROLLBACK');throw new Error('Expired or reused SSO state');}
  verifier=decrypt(row.verifier_cipher,'oauth:'+sha(state));expected=row.expected_character_id;
  db.prepare('DELETE FROM oauth_states WHERE state_hash=?').run(sha(state));db.exec('COMMIT');
 }finally{db.close();}
 const token=await (dependencies.requestTokens??tokenRequest)(new URLSearchParams({grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:config.callbackUrl}));
 const identity=await (dependencies.verifyToken??verifyAccessToken)(token.access_token);
 if(expected&&expected!==identity.id)throw new Error('Reauthorize must select the same character');
 saveAuthorization(identity,token);return identity.id;
}
export function saveAuthorization(identity:{id:string;name:string;ownerHash:string;scopes:string[]},token:{access_token:string;refresh_token:string;expires_in:number}){
 const db=getDatabase(),generation=randomUUID();
 try{
  db.exec('BEGIN IMMEDIATE');
  const prior=db.prepare('SELECT owner_hash FROM characters WHERE character_id=?').get(identity.id) as {owner_hash:string}|undefined;
  if(prior&&prior.owner_hash!==identity.ownerHash)db.prepare("UPDATE project_records SET is_current=0 WHERE source='esi' AND source_character_id=?").run(identity.id);
  db.prepare('DELETE FROM esi_cache WHERE cache_key LIKE ?').run(identity.id+':%');
  db.prepare("INSERT INTO characters VALUES (?,?,?,?,?,?,?,NULL,NULL) ON CONFLICT(character_id) DO UPDATE SET name=excluded.name,scopes=excluded.scopes,owner_hash=excluded.owner_hash,connection_status='connected',generation=excluded.generation,connected_at=excluded.connected_at,last_sync=NULL,last_error=NULL")
    .run(identity.id,identity.name,JSON.stringify(identity.scopes),identity.ownerHash,'connected',generation,new Date().toISOString());
  db.prepare('INSERT INTO encrypted_credentials VALUES (?,?,?,?,?) ON CONFLICT(character_id) DO UPDATE SET access_cipher=excluded.access_cipher,refresh_cipher=excluded.refresh_cipher,expires_at=excluded.expires_at,generation=excluded.generation')
    .run(identity.id,encrypt(token.access_token,'access:'+identity.id),encrypt(token.refresh_token,'refresh:'+identity.id),Date.now()+token.expires_in*1000,generation);
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
}
export async function accessToken(characterId:string,dependencies:SsoDependencies={}){
 const db=getDatabase();let row:{access_cipher:string;refresh_cipher:string;expires_at:number;generation:string;owner_hash:string;connection_status:string};
 try{
  const found=db.prepare('SELECT e.*,c.owner_hash,c.connection_status FROM encrypted_credentials e JOIN characters c USING(character_id) WHERE character_id=?').get(characterId) as typeof row|undefined;
  if(!found||found.connection_status!=='connected')throw new Error('Character is not connected');row=found;
 }finally{db.close();}
 if(row.expires_at>Date.now()+60000)return decrypt(row.access_cipher,'access:'+characterId);
 const token=await (dependencies.requestTokens??tokenRequest)(new URLSearchParams({grant_type:'refresh_token',refresh_token:decrypt(row.refresh_cipher,'refresh:'+characterId)}));
 const identity=await (dependencies.verifyToken??verifyAccessToken)(token.access_token);
 if(identity.id!==characterId||identity.ownerHash!==row.owner_hash)throw new Error('Character identity changed; reauthorize');
 const update=getDatabase();
 try{
  const saved=update.prepare('UPDATE encrypted_credentials SET access_cipher=?,refresh_cipher=?,expires_at=? WHERE character_id=? AND generation=?')
    .run(encrypt(token.access_token,'access:'+characterId),encrypt(token.refresh_token,'refresh:'+characterId),Date.now()+token.expires_in*1000,characterId,row.generation);
  if(saved.changes!==1)throw new Error('Authorization changed during refresh');
  update.prepare('UPDATE characters SET scopes=? WHERE character_id=? AND generation=?').run(JSON.stringify(identity.scopes),characterId,row.generation);
 }finally{update.close();}
 return token.access_token;
}
export function disconnect(characterId:string){
 const db=getDatabase();try{
  db.exec('BEGIN IMMEDIATE');db.prepare('DELETE FROM encrypted_credentials WHERE character_id=?').run(characterId);
  db.prepare("UPDATE characters SET connection_status='disconnected',generation=? WHERE character_id=?").run(randomUUID(),characterId);
  db.prepare('DELETE FROM esi_cache WHERE cache_key LIKE ?').run(characterId+':%');db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
}
