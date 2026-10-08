import {parse,isSafeNumber} from 'lossless-json';
import {getDatabase} from '../db';
export function parseEsiJson(text:string){return parse(text,null,value=>isSafeNumber(value)?Number(value):value);}
export type EsiResponse={data:unknown;rawText:string;fetchedAt:string;sourceTimestamp?:string;pages:number;cached:boolean};
export type EsiCache={body:string;etag?:string;expires_at:number;fetched_at:string;source_timestamp?:string};
export interface CacheStore{read(key:string):EsiCache|undefined;write(key:string,row:EsiCache):void;blockedUntil(group:string):number;block(group:string,until:number):void;}
export const sqliteCache:CacheStore={
 read(key){const db=getDatabase();try{return db.prepare('SELECT * FROM esi_cache WHERE cache_key=?').get(key) as EsiCache|undefined;}finally{db.close();}},
 write(key,r){const db=getDatabase();try{db.prepare('INSERT INTO esi_cache VALUES (?,?,?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET body=excluded.body,etag=excluded.etag,expires_at=excluded.expires_at,fetched_at=excluded.fetched_at,source_timestamp=excluded.source_timestamp').run(key,r.body,r.etag??null,r.expires_at,r.fetched_at,r.source_timestamp??null);}finally{db.close();}},
 blockedUntil(group){const db=getDatabase();try{return Number((db.prepare('SELECT retry_at FROM esi_rate_limits WHERE rate_group=?').get(group) as {retry_at:number}|undefined)?.retry_at??0);}finally{db.close();}},
 block(group,until){const db=getDatabase();try{db.prepare('INSERT INTO esi_rate_limits VALUES (?,?) ON CONFLICT(rate_group) DO UPDATE SET retry_at=MAX(retry_at,excluded.retry_at)').run(group,until);}finally{db.close();}}
};
export class EsiError extends Error{constructor(public status:number,public retryAt?:number){super(status===401?'ESI authorization expired; reauthorize':status===403?'ESI scope missing or access revoked':status===429||status===420?'ESI rate limit active; retry later':status===503?'ESI temporarily unavailable':'ESI request failed ('+status+')');}}
export class EsiClient{
 constructor(private token:string,private characterId:string,private cache:CacheStore=sqliteCache,private request:typeof fetch=fetch,private compatibilityDate=process.env.ESI_COMPATIBILITY_DATE??'2026-08-18'){}
 async get(path:string,group:string,params:Record<string,string>={}):Promise<EsiResponse>{
  if(!/^\/(characters\/\d+|universe\/)[\w/{}-]*$/.test(path))throw new Error('Unsupported ESI path');
  if(path.startsWith('/characters/')&&!path.startsWith('/characters/'+this.characterId+'/'))throw new Error('Cross-character ESI request rejected');
  const date=this.compatibilityDate;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>new Date(Date.now()-11*3600000).toISOString().slice(0,10))throw new Error('Invalid or future compatibility date');
  const url=new URL('https://esi.evetech.net'+path);url.search=new URLSearchParams(params).toString();
  const key=this.characterId+':'+date+':'+url.pathname+url.search,stored=this.cache.read(key);
  const responseFrom=(r:EsiCache,cached:boolean)=>({data:parseEsiJson(r.body),rawText:r.body,fetchedAt:r.fetched_at,sourceTimestamp:r.source_timestamp??undefined,pages:1,cached});
  if(stored&&stored.expires_at>Date.now()){
   const response=responseFrom(stored,true);response.pages=Number(this.cache.read(key+':pages')?.body??1);return response;
  }
  const blocked=Math.max(this.cache.blockedUntil(group),this.cache.blockedUntil('global'));
  if(blocked>Date.now())throw new EsiError(429,blocked);
  const headers:Record<string,string>={'X-Compatibility-Date':date,'Accept':'application/json','User-Agent':process.env.ESI_USER_AGENT??'Make-EvE-Free-Again/2.0 local-dashboard'};
  if(this.token)headers.Authorization='Bearer '+this.token;
  if(stored?.etag)headers['If-None-Match']=stored.etag;
  const res=await this.request(url,{headers,cache:'no-store',signal:AbortSignal.timeout(20000)});
  const now=new Date().toISOString();
  const ttl=Number(/max-age=(\d+)/.exec(res.headers.get('cache-control')??'')?.[1]??0);
  const expiresHeader=Date.parse(res.headers.get('expires')??'');
  const expiresAt=Number.isFinite(expiresHeader)?expiresHeader:Date.now()+ttl*1000;
  const reset=Number(res.headers.get('x-esi-error-limit-reset')??60)*1000;
  if(Number(res.headers.get('x-esi-error-limit-remain')??100)<=1)this.cache.block('global',Date.now()+reset);
  const remaining=res.headers.get('x-ratelimit-remaining');
  if(remaining!==null&&Number(remaining)===0){
   const resetSeconds=Number(res.headers.get('x-ratelimit-reset')??60);
   this.cache.block(group,resetSeconds>1e9?resetSeconds*1000:Date.now()+resetSeconds*1000);
  }
  if(res.status===429||res.status===420){
   const retry=res.headers.get('retry-after')??'60';
   const retryAt=/^\d+$/.test(retry)?Date.now()+Number(retry)*1000:Date.parse(retry);
   this.cache.block(group,Number.isFinite(retryAt)?retryAt:Date.now()+60000);throw new EsiError(res.status,retryAt);
  }
  if(res.status===304&&stored){
   const row={...stored,expires_at:expiresAt,fetched_at:now};this.cache.write(key,row);
   const response=responseFrom(row,true);response.pages=Number(this.cache.read(key+':pages')?.body??1);return response;
  }
  if(!res.ok){if(res.status>=500)this.cache.block(group,Date.now()+60000);throw new EsiError(res.status);}
  const body=await res.text();parseEsiJson(body);
  const pages=Number(res.headers.get('x-pages')??1);
  if(!Number.isInteger(pages)||pages<1||pages>100)throw new Error('ESI pagination exceeds supported limit');
  const sourceTimestamp=res.headers.get('last-modified')?new Date(res.headers.get('last-modified')!).toISOString():undefined;
  const row={body,etag:res.headers.get('etag')??undefined,expires_at:expiresAt,fetched_at:now,source_timestamp:sourceTimestamp};
  this.cache.write(key,row);this.cache.write(key+':pages',{...row,body:String(pages)});
  return {...responseFrom(row,false),pages};
 }
 async pages(path:string,group:string,params:Record<string,string>={}){
  const first=await this.get(path,group,{...params,page:'1'}),rows=[first];
  for(let page=2;page<=first.pages;page++)rows.push(await this.get(path,group,{...params,page:String(page)}));
  return rows;
 }
 async transactions(path:string){
  const responses:EsiResponse[]=[];let cursor:string|undefined;
  for(let i=0;i<100;i++){
   const response=await this.get(path,'char-wallet',cursor?{from_id:cursor}:{});
   if(!Array.isArray(response.data))throw new Error('ESI transactions must be an array');responses.push(response);
   if(response.data.length===0)return responses;
   const ids=response.data.map(r=>String((r as {transaction_id?:string|number}).transaction_id));
   if(ids.some(id=>!/^\d+$/.test(id)))throw new Error('Invalid transaction ID');
   // CCP includes the from_id record, including on the terminal page.
   if(cursor&&ids.length===1&&ids[0]===cursor)return responses;
   const next=ids.reduce((a,b)=>BigInt(a)<BigInt(b)?a:b);
   if(cursor&&BigInt(next)>=BigInt(cursor))throw new Error('ESI transaction pagination did not advance');cursor=next;
  }
  throw new Error('ESI transaction pagination exceeds supported limit');
 }
}
