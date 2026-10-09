import type {DatabaseSync} from 'node:sqlite';
import type {ProjectRecord} from './source-records';
import {assetGroups} from './asset-groups';
import {nameResolver} from './names';
export const PAGE_SIZE=25;
export function pageOf<T>(rows:T[],requested=0){const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE)),page=Math.min(Math.max(0,Math.floor(Number.isFinite(requested)?requested:0)),pages-1);return {rows:rows.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE),page,pages,total:rows.length};}
export function assetPage(rows:ProjectRecord[],characters:{character_id:string;name:string}[],query='',page=0){const names=nameResolver(rows,characters);const groups=assetGroups(rows).map(g=>({key:g.key,typeId:g.typeId,name:names.type(g.typeId),quantity:g.quantity,singleton:g.singleton,blueprint:g.blueprint,positionCount:g.positions.length,ownerCount:new Set(g.positions.map(p=>p.owner)).size})).filter(g=>g.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a,b)=>a.name.localeCompare(b.name)||a.key.localeCompare(b.key));return {...pageOf(groups,page),query};}
export type AssetPage=ReturnType<typeof assetPage>;
export type ImportRow={reportId:string;importedAt:string;filename:string;pillar:string;reportType:string;source:string;periodTo:string;status:string;provenance:string;kind:string};
export function importPage(db:DatabaseSync,query='',requested=0){
 const where="WHERE filename LIKE ? ESCAPE '\\' OR json_extract(body,'$.pillar') LIKE ? ESCAPE '\\' OR json_extract(body,'$.data.kind') LIKE ? ESCAPE '\\'";
 const term='%'+query.replace(/[\\%_]/g,c=>'\\'+c)+'%',count=db.prepare('SELECT COUNT(*) total FROM reports '+where).get(term,term,term) as {total:number};
 const pages=Math.max(1,Math.ceil(count.total/PAGE_SIZE)),page=Math.min(Math.max(0,Math.floor(Number.isFinite(requested)?requested:0)),pages-1);
 const rows=db.prepare("SELECT report_id reportId,imported_at importedAt,filename,json_extract(body,'$.pillar') pillar,json_extract(body,'$.reportType') reportType,json_extract(body,'$.source') source,json_extract(body,'$.period.to') periodTo,json_extract(body,'$.status') status,json_extract(body,'$.provenance') provenance,json_extract(body,'$.data.kind') kind FROM reports "+where+' ORDER BY imported_at DESC,report_id LIMIT ? OFFSET ?').all(term,term,term,PAGE_SIZE,page*PAGE_SIZE) as ImportRow[];
 return {rows:rows.map(row=>({...row})),total:count.total,page,pages,query};
}
export type ImportPage=ReturnType<typeof importPage>;
