import {observeInventory} from '../inventory-provenance';
import {Contract,contractRecords,archiveContract} from '../esi-contracts';
import {skillRecords,SkillSnapshot,Queue,economicSkills} from './skills';
import {z} from 'zod';
import {readSettings} from '../settings';
import {randomUUID} from 'node:crypto';
import {getDatabase} from '../db';
import {records,storeRaw,storeRecord,type ProjectRecord} from '../source-records';
import {ESI_SCOPES} from './config';
import {EsiClient,type EsiResponse} from './client';
import {accessToken} from './sso';
import {Planet,Asset,miningRecords,colonyRecords,journalRecords,transactionRecords,jobRecords,orderRecords} from './normalizers';
import {classifyJournal} from './classification';
export type Character={character_id:string;name:string;scopes:string;connection_status:string;generation:string;last_sync:string|null;last_error:string|null};
export function listCharacters(){const db=getDatabase();try{return db.prepare('SELECT character_id,name,scopes,connection_status,generation,last_sync,last_error FROM characters ORDER BY name').all().map(row=>({...row})) as Character[];}finally{db.close();}}
export function safeError(error:unknown){return error instanceof Error&&/^(ESI |SSO |Character |Authorization |Reauthorize |Sync )/.test(error.message)?error.message:'Sync failed; source data could not be safely read or normalized';}
export async function syncCharacter(characterId:string,options:{client?:EsiClient}={}){
 const character=listCharacters().find(c=>c.character_id===characterId);
 if(!character||character.connection_status!=='connected')throw new Error('Character is not connected');
 const generation=character.generation;
 const db=getDatabase(),runId=randomUUID(),leaseId=randomUUID();
 if(!readSettings(db).sources.esi){db.close();throw new Error('Sync disabled in settings');}
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
     for(const row of b.rows){const source={...row,rawId};if(row.kind==='contract_archive')archiveContract(write,source);else storeRecord(write,source);}
    }
    if(name==='wallet'){
     const ids=new Set(listCharacters().map(c=>c.character_id));
     for(const row of records(write,'wallet_journal')){
      const c=classifyJournal(row.data,ids,row.sourceCharacterId);
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
  if(typeof balance.data!=='number'&&typeof balance.data!=='string')throw new Error('Unexpected wallet balance');
  const balanceRecord:ProjectRecord={kind:'wallet_balance',source:'esi',sourceClass:'automatic',sourceCharacterId:characterId,sourceEntityId:characterId,fetchedAt:balance.fetchedAt,sourceTimestamp:balance.sourceTimestamp,dataQuality:'measured',status:'actual',deduplicationKey:'esi:'+characterId+':wallet_balance',data:{wallet:balance.data}};
  const journal=await client.pages(path+'/journal','char-wallet');
  const transactions=await client.transactions(path+'/transactions');
  return [{path,response:balance,rows:[balanceRecord]},...journal.map(response=>({path:path+'/journal',response,rows:journalRecords(characterId,response)})),...transactions.map(response=>({path:path+'/transactions',response,rows:transactionRecords(characterId,response)}))];
 });
 await area('contracts',async()=>{
  const path=base+'/contracts',pages=await client.pages(path,'char-contract'),batches:{path:string;response:EsiResponse;rows:ProjectRecord[]}[]=[];
  for(const response of pages){const contracts=z.array(Contract).parse(response.data),items=new Map<string,unknown[]>();
   for(const c of contracts){const itemPath=path+'/'+c.contract_id+'/items',itemPages=await client.pages(itemPath,'char-contract');for(const itemResponse of itemPages){if(!Array.isArray(itemResponse.data))throw new Error('ESI contract items invalid');items.set(c.contract_id,[...(items.get(c.contract_id)??[]),...itemResponse.data]);batches.push({path:itemPath,response:itemResponse,rows:[]});}}
   batches.push({path,response,rows:contractRecords(characterId,response,items)});
  }return batches;
 });
 await area('industry',async()=>{const path=base+'/industry/jobs',response=await client.get(path,'char-industry',{include_completed:'true'});return [{path,response,rows:jobRecords(characterId,response)}];});
 await area('market',async()=>{const path=base+'/orders',response=await client.get(path,'char-market');return [{path,response,rows:orderRecords(characterId,response)}];},['market_order']);
 await area('assets',async()=>{const path=base+'/assets';return(await client.pages(path,'char-asset')).map(response=>({path,response,rows:z.array(Asset).parse(response.data).map(data=>({kind:'asset_snapshot',source:'esi',sourceClass:'automatic' as const,sourceCharacterId:characterId,sourceEntityId:data.item_id,fetchedAt:response.fetchedAt,sourceTimestamp:response.sourceTimestamp??response.fetchedAt,dataQuality:'measured' as const,status:'actual' as const,deduplicationKey:'esi:'+characterId+':asset:'+data.item_id,data}))}));},['asset_snapshot']);
 if(results.assets?.status==='success'){const inventoryDb=getDatabase();try{observeInventory(inventoryDb);}finally{inventoryDb.close();}}
 await area('skills',async()=>{const path=base+'/skills',response=await client.get(path,'char-detail'),attrs=await client.get(base+'/attributes','char-detail');return [{path,response,rows:skillRecords(characterId,response,'skill_snapshot')},{path:base+'/attributes',response:attrs,rows:skillRecords(characterId,attrs,'character_attributes')}];});
 await area('skillqueue',async()=>{const path=base+'/skillqueue',response=await client.get(path,'char-detail');return [{path,response,rows:skillRecords(characterId,response,'skill_queue')}];});
 await area('implants',async()=>{const path=base+'/implants',response=await client.get(path,'char-detail');return [{path,response,rows:skillRecords(characterId,response,'character_implants')}];});
 // Metadata is bounded and cached. Failure does not discard a valid skill snapshot.
 if(['contracts','skills','skillqueue','pi','mining','industry','assets'].some(key=>scopes.has(ESI_SCOPES[key as keyof typeof ESI_SCOPES]))){
  try{const read=getDatabase();let rows:ProjectRecord[];let knownTypes:Set<string>;try{knownTypes=new Set(records(read,'type_metadata').map(r=>r.sourceEntityId!));rows=records(read).filter(r=>r.sourceCharacterId===characterId);}finally{read.close();}
   const snapshot=rows.find(r=>r.kind==='skill_snapshot'),queue=rows.find(r=>r.kind==='skill_queue');
   const operationalIds=rows.flatMap(r=>r.kind==='contract_archive'&&Array.isArray(r.data.items)?r.data.items.map(i=>String((i as {type_id:string}).type_id)):r.kind==='mining_entry'?[String(r.data.typeId)]:r.kind==='pi_pin'?[String(r.data.type_id),...(Array.isArray(r.data.contents)?r.data.contents.map(c=>String((c as {type_id:string}).type_id)):[]),...(r.data.extractor_details&&typeof r.data.extractor_details==='object'&&'product_type_id' in r.data.extractor_details?[String(r.data.extractor_details.product_type_id)]:[])]:r.kind==='asset_snapshot'?[String(r.data.type_id)]:r.kind==='industry_job'?[String(r.data.blueprint_type_id),...(r.data.product_type_id?[String(r.data.product_type_id)]:[])]:[]).filter(id=>/^\d+$/.test(id));
   const ids=[...new Set([...operationalIds,...(queue?Queue.parse(queue.data.queue).map(q=>q.skill_id):[]),...economicSkills.map(s=>s.id),...(snapshot?SkillSnapshot.parse(snapshot.data).skills.map(s=>s.skill_id):[])])].filter(id=>!knownTypes.has(id)).slice(0,80);
   for(const id of ids){const path='/universe/types/'+id,response=await client.get(path,'universe'),data=z.object({name:z.string(),type_id:z.number().int().safe(),description:z.string().optional()}).passthrough().parse(response.data),write=getDatabase();try{if(typeof data.group_id==='number'||typeof data.group_id==='string'){const groupPath='/universe/groups/'+data.group_id,group=await client.get(groupPath,'universe'),g=z.object({category_id:z.number().int().safe(),name:z.string()}).passthrough().parse(group.data);data.category_id=g.category_id;data.group_name=g.name;storeRaw(write,{source:'esi',endpoint:groupPath,fetchedAt:group.fetchedAt,payloadText:group.rawText});}const rawId=storeRaw(write,{source:'esi',endpoint:path,fetchedAt:response.fetchedAt,sourceTimestamp:response.sourceTimestamp,payloadText:response.rawText});storeRecord(write,{kind:'type_metadata',source:'esi',sourceClass:'automatic',sourceEntityId:id,fetchedAt:response.fetchedAt,sourceTimestamp:response.sourceTimestamp??response.fetchedAt,dataQuality:'measured',status:'actual',deduplicationKey:'esi:type:'+id,data,rawId});}finally{write.close();}}
   const schematics=[...new Set(rows.filter(r=>r.kind==='pi_pin').flatMap(r=>{const d=r.data;const f=d.factory_details as {schematic_id?:string}|undefined;return f?.schematic_id?[f.schematic_id]:typeof d.schematic_id==='string'?[d.schematic_id]:[];}))].slice(0,40);
   for(const id of schematics){const path='/universe/schematics/'+id,response=await client.get(path,'universe'),data=z.object({schematic_name:z.string(),cycle_time:z.number().positive()}).parse(response.data),write=getDatabase();try{const rawId=storeRaw(write,{source:'esi',endpoint:path,fetchedAt:response.fetchedAt,payloadText:response.rawText});storeRecord(write,{kind:'schematic_metadata',source:'esi',sourceClass:'automatic',sourceEntityId:id,fetchedAt:response.fetchedAt,sourceTimestamp:response.sourceTimestamp??response.fetchedAt,dataQuality:'measured',status:'actual',deduplicationKey:'esi:schematic:'+id,data,rawId});}finally{write.close();}}
   results.type_names={status:'success',records:ids.length+schematics.length};
  }catch(e){results.type_names={status:'error',error:safeError(e)};}
 }
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
