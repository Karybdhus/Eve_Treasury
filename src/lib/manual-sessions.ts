import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {getDatabase} from './db';
import {storeRecord} from './source-records';
export const StartSession=z.strictObject({type:z.enum(['hacking','salvage','mining','ratting','other']),characterId:z.string().regex(/^\d+$/),notes:z.string().max(2000).default('')});
export function startSession(input:unknown){
 const r=StartSession.parse(input),db=getDatabase(),id=randomUUID(),startedAt=new Date().toISOString();
 try{
  db.exec('BEGIN IMMEDIATE');
  if(!db.prepare('SELECT character_id FROM characters WHERE character_id=?').get(r.characterId))throw new Error('Unknown character');
  if(db.prepare('SELECT session_id FROM manual_sessions WHERE character_id=? AND ended_at IS NULL').get(r.characterId))throw new Error('A session is already running for this character');
  db.prepare('INSERT INTO manual_sessions VALUES (?,?,?,?,NULL,?)').run(id,r.characterId,r.type,startedAt,r.notes);
  storeRecord(db,{kind:'manual_session',source:'manual',sourceClass:'manual',sourceCharacterId:r.characterId,sourceEntityId:id,fetchedAt:startedAt,sourceTimestamp:startedAt,status:'actual',dataQuality:'measured',deduplicationKey:'manual:session:'+id,data:{type:r.type,start:startedAt,end:null,notes:r.notes,fleetHours:'not_reported'}});
  db.exec('COMMIT');return id;
 }catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
}
export function endSession(id:string){
 if(!z.uuid().safeParse(id).success)throw new Error('Invalid session ID');
 const db=getDatabase();try{
  db.exec('BEGIN IMMEDIATE');
  const r=db.prepare('SELECT * FROM manual_sessions WHERE session_id=?').get(id) as {type:string;character_id:string;started_at:string;ended_at:string|null;notes:string}|undefined;
  if(!r)throw new Error('Unknown session');if(r.ended_at){db.exec('COMMIT');return;}
  const endedAt=new Date().toISOString();
  db.prepare('UPDATE manual_sessions SET ended_at=? WHERE session_id=?').run(endedAt,id);
  storeRecord(db,{kind:'manual_session',source:'manual',sourceClass:'manual',sourceCharacterId:r.character_id,sourceEntityId:id,fetchedAt:endedAt,sourceTimestamp:endedAt,status:'actual',dataQuality:'measured',deduplicationKey:'manual:session:'+id,data:{type:r.type,start:r.started_at,end:endedAt,notes:r.notes,elapsedHours:(Date.parse(endedAt)-Date.parse(r.started_at))/3600000,fleetHours:'not_reported'}});
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
}
