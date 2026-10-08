import {randomUUID} from 'node:crypto';
import {getDatabase} from '../db';
import {records,storeRaw,storeRecord,type ProjectRecord} from '../source-records';
import {ESI_SCOPES} from './config';
import {EsiClient,type EsiResponse} from './client';
import {accessToken} from './sso';
import {Planet,miningRecords,colonyRecords,journalRecords,transactionRecords,jobRecords,orderRecords} from './normalizers';
import {classifyJournal} from './classification';
export type Character={character_id:string;name:string;scopes:string;connection_status:string;generation:string;last_sync:string|null;last_error:string|null};
export function listCharacters(){const db=getDatabase();try{return db.prepare('SELECT character_id,name,scopes,connection_status,generation,last_sync,last_error FROM characters ORDER BY name').all() as Character[];}finally{db.close();}}
export function safeError(error:unknown){return error instanceof Error&&/^(ESI |SSO |Character |Authorization |Reauthorize |Sync )/.test(error.message)?error.message:'Sync failed; source data could not be safely read or normalized';}
export async function syncCharacter(characterId:string,options:{client?:EsiClient}={}){
 const character=listCharacters().find(c=>c.character_id===characterId);
 if(!character||character.connection_status!=='connected')throw new Error('Character is not connected');
 const generation=character.generation;
 const db=getDatabase(),runId=randomUUID(),leaseId=randomUUID();
 try{
  db.exec('BEGIN IMMEDIATE');
  db.prepare('DELETE FROM sync_locks WHERE expires_at<?').run(Date.now());
  if(db.prepare('SELECT character_id FROM sync_locks WHERE character_id=?').get(characterId))throw new Error('Sync already running for this character');
  db.prepare('INSERT INTO sync_locks VALUES (?,?,?)').run(characterId,leaseId,Date.now()+300000);
  db.prepare('INSERT INTO esi_sync_runs VALUES (?,?,?,NULL,?,?)').run(runId,characterId,new Date().toISOString(),'running','{}');
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');db.close();throw e;}
 db.close();
 const results:Record<string,{status:string;records?:number;error?:string}>={};
 const scopes=new Set<string>(JSON.parse(character.scopes));
 let client:EsiClient;
 try{client=options.client??new EsiClient(await accessToken(characterId),characterId);}
 catch(e){finish(false,safeError(e));throw new Error(safeError(e));}
 async function area(name:keyof typeof ESI_SCOPES,load:()=>Promise<{path:string;response:EsiResponse;rows:ProjectRecord[]}[]>,replaceKinds:string[]=[]){
  if(!scopes.has(ESI_SCOPES[name])){results[name]={status:'scope_missing'};return;}
  try{
   const batches=await load(),write=getDatabase();
   const lease=write.prepare('UPDATE sync_locks SET expires_at=? WHERE character_id=? AND lease_id=? AND expires_at>?').run(Date.now()+300000,characterId,leaseId,Date.now());
   if(lease.changes!==1){write.close();throw new Error('Sync lease expired; restart sync');}
   try{
    write.exec('BEGIN IMMEDIATE');
    const current=write.prepare('SELECT generation,connection_status FROM characters WHERE character_id=?').get(characterId) as Character;
    if(current.generation!==generation||current.connection_status!=='connected')throw new Error('Authorization changed during sync');
    if(replaceKinds.length)for(const kind of replaceKinds)if(kind==='mining_entry'){const cutoff=new Date(Date.now()-30*86400000).toISOString().slice(0,10);write.prepare("UPDATE project_records SET is_current=0 WHERE source='esi' AND source_character_id=? AND kind=? AND json_extract(body,'$.sourceDate')>=?").run(characterId,kind,cutoff);}else write.prepare("UPDATE project_records SET is_current=0 WHERE source='esi' AND source_character_id=? AND kind=?").run(characterId,kind);
    for(const b of batches){
     const rawId=storeRaw(write,{source:'esi',characterId,endpoint:b.path,fetchedAt:b.response.fetchedAt,sourceTimestamp:b.response.sourceTimestamp,payloadText:b.response.rawText});
     for(const row of b.rows)storeRecord(write,{...row,rawId});
    }
    if(name==='wallet'){
     const ids=new Set(listCharacters().map(c=>c.character_id));
     for(const row of records(write,'wallet_journal')){
      const c=classifyJournal(row.data,ids);
      write.prepare('INSERT INTO wallet_classifications VALUES (?,?,?,?) ON CONFLICT(deduplication_key) DO UPDATE SET category=excluded.category,quality=excluded.quality,rule_version=excluded.rule_version').run(row.deduplicationKey,c.category,c.quality,'1.0');
     }
    }
    write.exec('COMMIT');results[name]={status:'success',records:batches.reduce((n,b)=>n+b.rows.length,0)};
   }catch(e){write.exec('ROLLBACK');throw e;}finally{write.close();}
  }catch(e){results[name]={status:'error',error:safeError(e)};}
 }
 const base='/characters/'+characterId;
 await area('mining',async()=>{const path=base+'/mining';return(await client.pages(path,'char-industry')).map(response=>({path,response,rows:miningRecords(characterId,response)}));},['mining_entry']);
 await area('pi',async()=>{
  const path=base+'/planets',response=await client.get(path,'char-industry');
  if(!Array.isArray(response.data))throw new Error('Unexpected colony list');
  const batches:{path:string;response:EsiResponse;rows:ProjectRecord[]}[]=[{path,response,rows:[]}];
  for(const rawPlanet of response.data){
   const p=Planet.parse(rawPlanet);if(p.owner_id!==characterId)throw new Error('Character colony owner mismatch');const detail=await client.get(path+'/'+p.planet_id,'char-industry');
   batches.push({path:path+'/'+p.planet_id,response:detail,rows:colonyRecords(characterId,p,detail)});
  }
  return batches;
 },['pi_colony','pi_pin']);
 await area('wallet',async()=>{
  const path=base+'/wallet',balance=await client.get(path,'char-wallet');
  if(typeof balance.data!=='number')throw new Error('Unexpected wallet balance');
  const balanceRecord:ProjectRecord={kind:'wallet_balance',source:'esi',sourceClass:'automatic',sourceCharacterId:characterId,sourceEntityId:characterId,fetchedAt:balance.fetchedAt,sourceTimestamp:balance.sourceTimestamp,dataQuality:'measured',status:'actual',deduplicationKey:'esi:'+characterId+':wallet_balance',data:{wallet:balance.data}};
  const journal=await client.pages(path+'/journal','char-wallet');
  const transactions=await client.transactions(path+'/transactions');
  return [{path,response:balance,rows:[balanceRecord]},...journal.map(response=>({path:path+'/journal',response,rows:journalRecords(characterId,response)})),...transactions.map(response=>({path:path+'/transactions',response,rows:transactionRecords(characterId,response)}))];
 });
 await area('industry',async()=>{const path=base+'/industry/jobs',response=await client.get(path,'char-industry',{include_completed:'true'});return [{path,response,rows:jobRecords(characterId,response)}];});
 await area('market',async()=>{const path=base+'/orders',response=await client.get(path,'char-market');return [{path,response,rows:orderRecords(characterId,response)}];},['market_order']);
 const errors=Object.values(results).filter(r=>r.status==='error');
 finish(errors.length===0,errors.map(r=>r.error).join('; '));return {runId,results};
 function finish(success:boolean,error:string){
  const write=getDatabase();try{
   write.prepare('UPDATE esi_sync_runs SET finished_at=?,status=?,details=? WHERE run_id=?').run(new Date().toISOString(),success?'success':'partial',JSON.stringify(results),runId);
   write.prepare('UPDATE characters SET last_sync=CASE WHEN ?=1 THEN ? ELSE last_sync END,last_error=? WHERE character_id=? AND generation=?').run(success?1:0,new Date().toISOString(),error||null,characterId,generation);
   write.prepare('DELETE FROM sync_locks WHERE character_id=? AND lease_id=?').run(characterId,leaseId);
  }finally{write.close();}
 }
}
