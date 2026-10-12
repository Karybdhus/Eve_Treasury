import type {DatabaseSync} from 'node:sqlite';
import {Contract,ContractItem} from './esi-contracts';
import type {SourceObservation} from './economic-baseline';
import {exactJson,moneyFact} from './exact-money';
export type OpeningContractStock={contractId:string;owner:string;status:string;dateIssued:string;observedAt:string;rawIds:string[];items:{recordId:string;typeId:string;quantity:string;assetOverlap:boolean}[];location:string;complete:boolean};
// Only contracts in the successful endpoint version may enter an opening snapshot.
export function observedOpenContractStock(db:DatabaseSync,owners:string[],now:string,assets:{itemId:string;typeId:string;quantity:string;owner:string}[]){
 const own=new Set(owners),result:OpeningContractStock[]=[];const seen=new Set<string>();
 for(const owner of owners){const row=db.prepare('SELECT body FROM economic_source_observations WHERE character_id=? AND source=?').get(owner,'contracts');if(!row)continue;const observation=JSON.parse(String(row.body)) as SourceObservation;
 for(const rawId of observation.rawIds){const raw=db.prepare('SELECT endpoint,payload_text FROM raw_source_records WHERE raw_id=?').get(rawId);if(!raw||raw.endpoint!=='/characters/'+owner+'/contracts')continue;const list=exactJson(String(raw.payload_text));if(!Array.isArray(list))continue;
 for(const input of list){const c=Contract.parse(input);if(c.issuer_id!==owner||c.for_corporation||c.type!=='item_exchange'||c.status!=='outstanding'||own.has(c.assignee_id)||moneyFact(c.price).value===null||Number(c.price)===0||Date.parse(c.date_issued)>Date.parse(now)||seen.has(c.contract_id))continue;seen.add(c.contract_id);
 const endpoint='/characters/'+owner+'/contracts/'+c.contract_id+'/items',itemRawIds=observation.rawIds.filter(id=>db.prepare('SELECT 1 FROM raw_source_records WHERE raw_id=? AND endpoint=?').get(id,endpoint));const items=itemRawIds.flatMap(id=>{const data=exactJson(String(db.prepare('SELECT payload_text FROM raw_source_records WHERE raw_id=?').get(id)!.payload_text));return Array.isArray(data)?data.map(i=>ContractItem.parse(i)):[];}).filter(i=>i.is_included&&BigInt(i.quantity)>0n);
 const at=observation.versions?.find(v=>v.rawId===rawId)?.observedAt??observation.observedAt;const unique=new Set(items.map(i=>i.record_id));const state=db.prepare('SELECT body FROM app_settings WHERE name=?').get('esi_sync:source:'+owner+':contracts');const complete=!!state&&JSON.parse(String(state.body)).status==='success'&&itemRawIds.length>0&&items.length>0&&unique.size===items.length&&Number.isFinite(Date.parse(at))&&Date.parse(now)-Date.parse(at)<=3600000&&Date.parse(at)<=Date.parse(now);
 result.push({contractId:c.contract_id,owner,status:c.status,dateIssued:c.date_issued,observedAt:at,rawIds:[rawId,...itemRawIds],location:String(c.start_location_id??'unknown'),complete,items:items.map(i=>({recordId:i.record_id,typeId:i.type_id,quantity:i.quantity,assetOverlap:assets.some(a=>a.owner===owner&&a.itemId===i.record_id&&a.typeId===i.type_id&&a.quantity===i.quantity)}))});
 }}}
 return result;
}
export const reservedContractLot=(baselineId:string,contractId:string,recordId:string)=>'opening-contract:'+baselineId+':'+contractId+':'+recordId;
