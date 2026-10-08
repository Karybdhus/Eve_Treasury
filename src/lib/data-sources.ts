import type {DatabaseSync} from 'node:sqlite';
import {readReports} from './db';
import {records,type ProjectRecord,sourceClass} from './source-records';
export interface ProjectDataSource{read(db:DatabaseSync):ProjectRecord[];}
export class JsonReportDataSource implements ProjectDataSource{
 read(db:DatabaseSync):ProjectRecord[]{
  return readReports(db).map(s=>({kind:'report',source:s.report.source,sourceClass:sourceClass(s.report.source),sourceEntityId:s.report.reportId,fetchedAt:s.importedAt,sourceTimestamp:s.report.period.to,dataQuality:s.report.provenance==='historical_seed'?'historical_seed':'partial',status:s.report.status,deduplicationKey:'report:'+s.report.reportId,data:s.report}));
 }
}
export class EsiDataSource implements ProjectDataSource{read(db:DatabaseSync){const states=db.prepare('SELECT character_id,connection_status FROM characters').all() as {character_id:string;connection_status:string}[];return records(db).filter(r=>r.source==='esi').map(r=>({...r,connectionStatus:states.find(c=>c.character_id===r.sourceCharacterId)?.connection_status??'disconnected'}));}}
export class MotorMarketDataSource implements ProjectDataSource{
 // JSON import remains the integration boundary; no direct database access.
 read(db:DatabaseSync){return new JsonReportDataSource().read(db).filter(r=>r.source==='motor_market');}
}
export class ManualDataSource implements ProjectDataSource{read(db:DatabaseSync){return records(db).filter(r=>r.sourceClass==='manual');}}
export function projectData(db:DatabaseSync){
 const all=[...new JsonReportDataSource().read(db),...new EsiDataSource().read(db),...new ManualDataSource().read(db)];
 return [...new Map(all.map(r=>[r.deduplicationKey,r])).values()];
}
