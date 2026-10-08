import {createHash} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {SdeCatalog,type Catalog,piChainAnalysis} from './pi-chains';
import type {ProjectRecord} from './source-records';
export function catalogKey(catalog:Catalog){return catalog.build+':'+createHash('sha256').update(JSON.stringify(catalog)).digest('hex');}
export function readPiCatalog(){return SdeCatalog.parse(JSON.parse(readFileSync('seed/sde/pi-catalog.json','utf8')));}
export function catalogForScenario(db:DatabaseSync,row:ProjectRecord,current:Catalog){const build=row.data.sdeCatalogKey??row.data.sdeBuild;if(!build||build===catalogKey(current)||!row.data.sdeCatalogKey&&build===current.build)return current;const old=db.prepare('SELECT body FROM sde_imports WHERE build=?').get(String(build)) as {body:string}|undefined;if(!old)throw new Error('Archived SDE catalog missing for scenario '+row.sourceEntityId);return SdeCatalog.parse(JSON.parse(old.body));}
export function savedPiAnalyses(db:DatabaseSync,rows:ProjectRecord[],current:Catalog){return rows.filter(r=>r.kind==='pi_chain_scenario').map(r=>{try{return {key:r.deduplicationKey,analysis:piChainAnalysis(r.data,catalogForScenario(db,r,current)),error:null};}catch(e){return {key:r.deduplicationKey,analysis:null,error:(e as Error).message};}});}