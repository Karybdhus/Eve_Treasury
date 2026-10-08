import {writeMoneyFacts} from './financial-facts';
import {createHash,randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
export type SourceClass='automatic'|'agent'|'manual';
export type Quality='measured'|'partial'|'unknown'|'historical_seed';
export type ProjectRecord<T=Record<string,unknown>>={
  kind:string;source:string;sourceClass:SourceClass;sourceCharacterId?:string;sourceEntityId?:string;
  fetchedAt:string;sourceTimestamp?:string;dataQuality:Quality;status:'actual'|'plan'|'estimate';
  deduplicationKey:string;data:T;rawId?:string;isCurrent?:boolean;connectionStatus?:string;
};
export function sourceClass(source:string):SourceClass{return source==='agent'?'agent':['esi','motor_market','buyback'].includes(source)?'automatic':'manual';}
export function sha(value:string){return createHash('sha256').update(value).digest('hex');}
export function storeRaw(db:DatabaseSync,r:{source:string;characterId?:string;endpoint:string;entityId?:string;fetchedAt:string;sourceTimestamp?:string;payloadText:string}){
  const hash=sha(r.payloadText),id=sha([r.source,r.characterId??'',r.endpoint,r.entityId??'',hash].join(':'));
  db.prepare('INSERT OR IGNORE INTO raw_source_records VALUES (?,?,?,?,?,?,?,?,?)').run(id,r.source,r.characterId??null,r.endpoint,r.entityId??null,r.fetchedAt,r.sourceTimestamp??null,r.payloadText,hash);
  return id;
}
export function storeRecord(db:DatabaseSync,r:ProjectRecord){
  const original=r.rawId?db.prepare('SELECT payload_text FROM raw_source_records WHERE raw_id=?').get(r.rawId) as {payload_text:string}|undefined:undefined;
  writeMoneyFacts(db,r.deduplicationKey,r.data,original?.payload_text);
  db.prepare('INSERT INTO project_records VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(deduplication_key) DO UPDATE SET fetched_at=excluded.fetched_at,source_timestamp=excluded.source_timestamp,data_quality=excluded.data_quality,status=excluded.status,body=excluded.body,raw_id=excluded.raw_id,is_current=excluded.is_current')
    .run(r.deduplicationKey,r.kind,r.source,r.sourceClass,r.sourceCharacterId??null,r.sourceEntityId??null,r.fetchedAt,r.sourceTimestamp??null,r.dataQuality,r.status,JSON.stringify(r.data),r.rawId??null,r.isCurrent===false?0:1);
}
export function records(db:DatabaseSync,kind?:string):ProjectRecord[]{
  const sql='SELECT * FROM project_records WHERE is_current=1'+(kind?' AND kind=?':'')+' ORDER BY fetched_at DESC';
  const rows=(kind?db.prepare(sql).all(kind):db.prepare(sql).all()) as Record<string,string|number|null>[];
  return rows.map(r=>({kind:String(r.kind),source:String(r.source),sourceClass:r.source_class as SourceClass,sourceCharacterId:r.source_character_id?String(r.source_character_id):undefined,sourceEntityId:r.source_entity_id?String(r.source_entity_id):undefined,fetchedAt:String(r.fetched_at),sourceTimestamp:r.source_timestamp?String(r.source_timestamp):undefined,dataQuality:r.data_quality as Quality,status:r.status as ProjectRecord['status'],deduplicationKey:String(r.deduplication_key),data:JSON.parse(String(r.body)),rawId:r.raw_id?String(r.raw_id):undefined}));
}
export function recordId(){return randomUUID();}
