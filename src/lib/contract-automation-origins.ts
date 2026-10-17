import {manualContractOrigins} from './contract-manual-origins';
import type {DatabaseSync} from 'node:sqlite';
import {contractManagement} from './contract-management';
import {contractItemOrigins,contractOriginLinks,linkContractOrigin} from './contract-origins';
import {inventoryPosition,sliceCategories} from './inventory-provenance';
import {contractAutomationVersion} from './contract-automation-plan';
import {randomUUID} from 'node:crypto';
export function planAutomaticOrigins(db:DatabaseSync,id:string){
 const c=contractManagement(db,id),owner=c.role==='issuer'?c.issuerId:c.acceptorId;
 if(!c.completed||c.type!=='item_exchange'||c.direction!=='outgoing'||c.purpose!=='material_sale'||c.quality==='conflict'||contractOriginLinks(db,id).some(l=>l.status==='revoked')||manualContractOrigins(db,id).some(l=>!l.active))return [];
 const items=contractItemOrigins(db,id).filter(i=>i.direction==='outgoing'&&!i.conflict&&BigInt(i.unknownQuantity??'0')>0n);
 if(!items.length)return [];const typeIds=[...new Set(items.map(i=>i.type_id))];
 const positions=(db.prepare('SELECT item_id FROM inventory_positions WHERE owner=? AND type_id IN ('+typeIds.map(()=>'?').join(',')+") AND julianday(as_of)<=julianday(?) AND EXISTS(SELECT 1 FROM json_each(body,'$.slices') s WHERE json_extract(s.value,'$.active')=1 AND json_extract(s.value,'$.status')!='suggested' AND coalesce(json_extract(s.value,'$.unknownOrigin'),0)=0)").all(owner,...typeIds,c.dateIssued) as {item_id:string}[]).map(p=>inventoryPosition(db,p.item_id)!);
 const competingTypes=new Set<string>();
 if(positions.length){for(const row of db.prepare("SELECT DISTINCT source_entity_id FROM project_records WHERE kind='contract_archive' AND source_entity_id!=?").all(id)){const other=contractManagement(db,String(row.source_entity_id));if(other.completed&&other.direction==='outgoing'&&(other.role==='issuer'?other.issuerId:other.acceptorId)===owner&&(other.items??[]).some(i=>typeIds.includes(i.type_id))){for(const item of contractItemOrigins(db,other.contractId))if(BigInt(item.unknownQuantity??'0')>0n)competingTypes.add(item.type_id);}}}
 return items.map(i=>{
  const remaining=BigInt(i.unknownQuantity!),matches=positions.filter(p=>p.typeId===i.type_id&&!p.conflict&&!p.identityConflict&&Number.isFinite(Date.parse(p.asOf))&&Date.parse(p.asOf)<=Date.parse(c.dateIssued)).map(p=>({p,slices:p.slices.filter(s=>s.active&&s.status!=='suggested'&&!s.unknownOrigin&&new Set(sliceCategories(s)).size===1)})).filter(v=>v.slices.reduce((n,s)=>n+BigInt(s.quantity),0n)===remaining||v.slices.length===1&&BigInt(v.slices[0].quantity)>=remaining);
  const otherItems=items.some(other=>other.record_id!==i.record_id&&other.type_id===i.type_id);
  const competing=matches.length!==1||otherItems||competingTypes.has(i.type_id);
  return {recordId:i.record_id,status:matches.length===1&&!competing?'ready' as const:'proposal' as const,candidates:matches.map(({p,slices})=>({itemId:p.itemId,revision:p.revision,slices:slices.map(s=>({id:s.id,quantity:vQuantity(s.quantity,remaining,slices.length)}))}))};
 });
}
export function applyAutomaticOrigins(db:DatabaseSync,id:string){const changes:string[]=[];for(const proposal of planAutomaticOrigins(db,id)){if(proposal.status!=='ready')continue;const candidate=proposal.candidates[0];for(const slice of candidate.slices){const p=inventoryPosition(db,candidate.itemId)!;const link=linkContractOrigin(db,{contractId:id,contractRevision:contractManagement(db,id).revision,recordId:proposal.recordId,itemId:candidate.itemId,sliceId:slice.id,positionRevision:p.revision,quantity:slice.quantity,reason:'Automatic unique exact confirmed stock; rule '+contractAutomationVersion});const at=new Date().toISOString();db.prepare('INSERT INTO reconciliation_audit VALUES(?,?,?,?)').run(randomUUID(),'contract_automation_origin',at,JSON.stringify({contractId:id,version:contractAutomationVersion,evidence:proposal,linkId:link.linkId}));changes.push(link.linkId);}}return changes;}

function vQuantity(value:string,remaining:bigint,count:number){return count===1?remaining.toString():value;}
