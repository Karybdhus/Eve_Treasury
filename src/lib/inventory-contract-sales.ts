import {currentConsumedOrigin} from './inventory-proof-validity';
import type {DatabaseSync} from 'node:sqlite';import {baselineForCharacter} from './economic-baseline';import {contractManagement} from './contract-management';import {contractItemOrigins} from './contract-origins';import {consumeOriginLots,type ConsumedLot} from './inventory-continuity';import {planContractAutomation} from './contract-automation-plan';
export function applyContinuousContractOrigins(db:DatabaseSync,id:string){
 const contract=contractManagement(db,id),owner=contract.role==='issuer'?contract.issuerId:contract.acceptorId;const baseline=baselineForCharacter(db,owner);if(!baseline)return false;
 if(!baseline.characterIds.includes(owner)||!contract.completed||contract.direction!=='outgoing'||contract.type!=='item_exchange'||Date.parse(contract.dateIssued)<=Date.parse(baseline.createdAt))return false;
 const plan=planContractAutomation(db,id);if(!plan.paymentKey||plan.status==='manual'||plan.status==='ineligible')return false;
 const manualPositions=db.prepare('SELECT type_id,as_of,body FROM inventory_positions WHERE owner=?').all(owner);if(manualPositions.some(p=>Date.parse(String(p.as_of))>Date.parse(baseline.createdAt)&&(contract.items??[]).some(i=>i.type_id===p.type_id)&&JSON.parse(String(p.body)).slices.some((slice:{active:boolean;status:string})=>slice.active&&slice.status==='manually_confirmed')))return false;
 const origins=contractItemOrigins(db,id);if(origins.some(i=>i.conflict||i.origins.length))return false;
 db.exec('BEGIN IMMEDIATE');try{for(const item of contract.items??[]){if(item.direction!=='outgoing')continue;consumeOriginLots(db,{sourceKey:'contract-sale:'+id+':'+item.record_id,owner,typeId:item.type_id,quantity:item.quantity,at:contract.dateIssued,kind:'contract_sale',evidence:[plan.paymentKey,'contract:'+id+':'+item.record_id]});}db.exec('COMMIT');return true;}catch(e){db.exec('ROLLBACK');throw e;}
}
export function continuousContractSegments(db:DatabaseSync,id:string){
 const contract=contractManagement(db,id);const items=(contract.items??[]).filter(i=>i.direction==='outgoing');if(!items.length)return null;
 const result:{id:string;recordId:string;category:ConsumedLot['category'];quantity:string;costCents:string|null;origin:string}[]=[];
 for(const item of items){const row=db.prepare('SELECT body FROM inventory_origin_movements WHERE source_key=?').get('contract-sale:'+id+':'+item.record_id);if(!row)return null;
  const movement=JSON.parse(String(row.body)) as {input:{typeId:string;quantity:string;owner:string};segments:ConsumedLot[];unknownQuantity:string};
  if(movement.input.typeId!==item.type_id||movement.input.quantity!==item.quantity||movement.input.owner!==(contract.role==='issuer'?contract.issuerId:contract.acceptorId))throw Error('Continuous contract evidence changed');
  for(const [index,stored] of movement.segments.entries()){const segment=currentConsumedOrigin(db,stored);result.push({id:'lot:'+item.record_id+':'+index,recordId:item.record_id,category:segment.category,quantity:segment.quantity,costCents:segment.costCents,origin:segment.origin==='OPENING_STOCK'?'OPENING_STOCK':segment.origin+(segment.quality==='rule_based'?' (regelbasiert)':'')});}
  if(movement.unknownQuantity!=='0')result.push({id:'unknown:'+item.record_id,recordId:item.record_id,category:null,quantity:movement.unknownQuantity,costCents:null,origin:'Unknown'});
 }
 return result;
}