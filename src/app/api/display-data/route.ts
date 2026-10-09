import {projectData} from '@/lib/data-sources';
import {rattingEvidence} from '@/lib/esi/classification';
import {project} from '@/lib/accounting';
import {dateKey} from '@/lib/time';
import {getDatabase} from '@/lib/db';
import {assertApplicationRequest} from '@/lib/application-access';
import {records} from '@/lib/source-records';
import {readSettings} from '@/lib/settings';
import {assetGroups} from '@/lib/asset-groups';
import {pageOf,importPage} from '@/lib/display-pages';
import {nameResolver} from '@/lib/names';
import {financialReadModel} from '@/lib/financial-read-model';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){try{assertApplicationRequest(request);if(request.headers.get('sec-fetch-site')==='cross-site')throw new Error('Cross-site request rejected');}catch{return Response.json({error:'Lokaler autorisierter Zugriff erforderlich'},{status:403});}
 const q=new URL(request.url).searchParams,kind=q.get('kind'),key=q.get('key')??'',page=Number(q.get('page')??0),search=q.get('q')??'';if(key.length>512||search.length>200||!Number.isSafeInteger(page)||page<0)return Response.json({error:'Ungueltiger Filter'},{status:400});
 const db=getDatabase();try{let result:unknown;
 if(kind==='imports')result=importPage(db,search,page);
 else if(kind==='report'){const r=db.prepare('SELECT r.body,COALESCE(s.raw_body,r.body) raw FROM reports r LEFT JOIN imported_source_reports s USING(report_id) WHERE r.report_id=?').get(key) as {body:string;raw:string}|undefined;if(!r)return Response.json({error:'Bericht nicht gefunden'},{status:404});result={report:JSON.parse(r.body),raw:r.raw};}
 else if(kind==='asset_positions'){const settings=readSettings(db),characterId=q.get('characterId'),rows=records(db,'asset_snapshot').filter(r=>settings.sources[r.source as keyof typeof settings.sources]!==false&&(!characterId||r.sourceCharacterId===characterId)),g=assetGroups(rows).find(g=>g.key===key);if(!g)return Response.json({error:'Gegenstand nicht gefunden'},{status:404});const characters=db.prepare('SELECT character_id,name FROM characters').all() as {character_id:string;name:string}[],names=nameResolver([],characters),p=pageOf(g.positions,page);result={...p,rows:p.rows.map(p=>({...p,owner:names.character(p.owner),location:names.entity(p.location)}))};}
 else if(kind==='journal'){const selected=q.get('characterId'),characters=(db.prepare('SELECT character_id,name FROM characters').all() as {character_id:string;name:string}[]).filter(c=>!selected||c.character_id===selected),rows=projectData(db).filter(r=>(!selected||r.sourceCharacterId===selected)&&r.sourceTimestamp&&dateKey(r.sourceTimestamp)>=project.start&&dateKey(r.sourceTimestamp)<=project.end),names=nameResolver(rows,characters),classes=rattingEvidence(rows,new Set(characters.map(c=>c.character_id))).classes,p=pageOf(classes,page);result={...p,rows:p.rows.map(c=>({key:c.record.deduplicationKey,owner:names.character(c.record.sourceCharacterId),reference:c.record.sourceEntityId??'',date:c.record.sourceTimestamp??null,type:String(c.record.data.ref_type),amount:typeof c.record.data.amount==='number'||typeof c.record.data.amount==='string'?c.record.data.amount:null,category:c.category,quality:c.quality}))};}
 else if(kind==='review'){const state=financialReadModel(db),sources=state.sources.filter(s=>s.role!=='production').map(s=>({...s,raw:null}));const keys=new Set(sources.map(s=>s.key)),links=state.links.filter(l=>keys.has(l.source_key)),events=new Set(links.map(l=>l.event_id));result={...state,sources,links,events:state.events.filter(e=>events.has(e.event_id))};}
 else if(kind==='source'){const s=financialReadModel(db).sources.find(s=>s.key===key);if(!s)return Response.json({error:'Beleg nicht gefunden'},{status:404});result={raw:s.raw};}
 else return Response.json({error:'Unbekannte Ansicht'},{status:400});return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Daten konnten nicht geladen werden'},{status:500});}finally{db.close();}}
