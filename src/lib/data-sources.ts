import type {DatabaseSync} from 'node:sqlite';
import {readReports} from './db';
import {records,type ProjectRecord,sourceClass} from './source-records';
import {listBuybacks} from './buyback';
import {readSettings} from './settings';
export interface ProjectDataSource{read(db:DatabaseSync):ProjectRecord[];}
export class JsonReportDataSource implements ProjectDataSource{
 read(db:DatabaseSync):ProjectRecord[]{return readReports(db).map(s=>({kind:'report',source:s.report.source,sourceClass:sourceClass(s.report.source),sourceEntityId:s.report.reportId,fetchedAt:s.importedAt,sourceTimestamp:s.report.period.to,dataQuality:s.report.provenance==='historical_seed'?'historical_seed':'partial',status:s.report.status,deduplicationKey:'report:'+s.report.reportId,data:s.report}));}
}
export class AgentJsonDataSource extends JsonReportDataSource{override read(db:DatabaseSync){return super.read(db).filter(r=>r.source==='agent');}}
export class EsiDataSource implements ProjectDataSource{read(db:DatabaseSync){const states=db.prepare('SELECT character_id,connection_status FROM characters').all() as {character_id:string;connection_status:string}[];return records(db).filter(r=>r.source==='esi').map(r=>({...r,connectionStatus:states.find(c=>c.character_id===r.sourceCharacterId)?.connection_status??'disconnected'}));}}
export class MotorMarketDataSource implements ProjectDataSource{read(db:DatabaseSync){return [...new JsonReportDataSource().read(db).filter(r=>r.source==='motor_market'),...records(db,'motor_trade')];}}
export class BuybackDataSource implements ProjectDataSource{read(db:DatabaseSync):ProjectRecord[]{return listBuybacks(db).filter(b=>b.reportingStatus!=='cancelled').map(b=>({kind:'buyback',source:'buyback',sourceClass:b.source==='manual'?'manual':'automatic',sourceCharacterId:b.characterId??undefined,sourceEntityId:b.bookingId,fetchedAt:b.updatedAt,sourceTimestamp:b.payoutDate?b.payoutDate+'T12:00:00Z':undefined,dataQuality:b.historicalAggregate?'partial':'measured',status:b.reportingStatus==='confirmed_payout'?'actual':'estimate',deduplicationKey:'buyback:'+b.bookingId,data:b}));}}
export class ManualDataSource implements ProjectDataSource{read(db:DatabaseSync){return records(db).filter(r=>r.sourceClass==='manual');}}
// Optional connectors are explicitly unavailable until an authenticated adapter exists.
export class OptionalEvemonDataSource implements ProjectDataSource{read():ProjectRecord[]{return [];}}
export class OptionalGoogleDriveDataSource implements ProjectDataSource{read():ProjectRecord[]{return [];}}
export function projectData(db:DatabaseSync){
 const s=readSettings(db),all=[...new JsonReportDataSource().read(db),...new EsiDataSource().read(db),...new ManualDataSource().read(db),...new BuybackDataSource().read(db),...new MotorMarketDataSource().read(db)];
 return [...new Map(all.filter(r=>s.sources[r.source as keyof typeof s.sources]!==false).map(r=>[r.deduplicationKey,r])).values()];
}
