import {currentConsumedOrigin} from './inventory-proof-validity';
import type {OriginLot} from './inventory-continuity';
import {readFileSync} from 'node:fs';
const catalog=JSON.parse(readFileSync('seed/sde/activity-catalog.json','utf8')) as {types:Record<string,{name:string;groupId:string;metaGroupId:string|null}>;groups:Record<string,{name:string;categoryId:string}>};
import type {DatabaseSync} from 'node:sqlite';
import type {EconomicCategory} from './economic-categories';
export const itemActivityRuleVersion='17.1';
type Type={name:string;groupId:string;metaGroupId:string|null};
export function catalogActivity(typeId:string):{category:EconomicCategory|null;reason:string}{
 const type=(catalog.types as Record<string,Type>)[typeId],group=type?(catalog.groups as Record<string,{name:string;categoryId:string}>)[type.groupId]:null;
 if(!type||!group)return {category:null,reason:'Item fehlt im SDE-Katalog'};
 if(group.categoryId==='25'||type.groupId==='423')return {category:'MINING',reason:'SDE Ore / Ice / Ice Products'};
 if(['42','43'].includes(group.categoryId))return {category:'PI',reason:'SDE planetare Rohstoffe / Commodities'};
 if(type.groupId==='754')return {category:'SALVAGE',reason:'SDE Salvaged Materials; Standardregel, Site-Herkunft kann abweichen'};
 if(typeId==='33577')return {category:'HACKING',reason:'SDE Covert Research Tools; Site-Material-Standard'};
 if(['966','333','1141','728','729','730','731','732','733','734','735','979','1304'].includes(type.groupId))return {category:'HACKING',reason:'SDE Site-Material / Datacore / Research Data / Decryptor'};
 if(['6','7','8','18','20','22'].includes(group.categoryId)||['530','314','283'].includes(type.groupId)||['5','6'].includes(type.metaGroupId??''))return {category:'LOOT',reason:'SDE Schiff / Modul / Munition / Site-Ware: deterministischer Loot-Standard ohne Kaufbeleg'};
 return {category:'MISC',reason:'Bekannter SDE-Typ mit mehrdeutiger Aktivitaet: dokumentierter MISC-Standard ohne Kaufbeleg'};
}
export type ActivitySegment={id:string;recordId:string;category:EconomicCategory|null;quantity:string;costCents:string|null;origin?:string;basis?:'rule_based'};
// Classification changes attribution only, never physical quantities or cash events.
export function inferContractSegments(db:DatabaseSync,id:string,segments:ActivitySegment[],owner:string,at:string,items:{record_id:string;type_id:string;quantity:string}[]){
 return segments.map(segment=>{
  if(segment.category||segment.origin==='CONFLICT')return segment;
  const item=items.find(i=>i.record_id===segment.recordId);if(!item)return segment;
  const purchases=db.prepare("SELECT r.body FROM project_records r WHERE r.kind='wallet_transaction' AND r.source='esi' AND r.status='actual' AND r.is_current=1 AND r.data_quality!='historical_seed' AND r.source_character_id=? AND CAST(json_extract(r.body,'$.type_id') AS TEXT)=? AND json_extract(r.body,'$.is_buy')=1 AND json_extract(r.body,'$.is_personal')=1 AND NOT EXISTS(SELECT 1 FROM characters WHERE character_id=CAST(json_extract(r.body,'$.client_id') AS TEXT)) AND julianday(json_extract(r.body,'$.date'))<=julianday(?) ORDER BY r.deduplication_key").all(owner,item.type_id,at);
  const acquired=purchases.reduce((n,r)=>{const q=String(JSON.parse(String(r.body)).quantity);return /^[1-9][0-9]*$/.test(q)?n+BigInt(q):n;},0n);
  let purchaseConflict=false;const boughtContract=db.prepare("SELECT body FROM inventory_origin_lots WHERE json_extract(body,'$.owner')=? AND json_extract(body,'$.typeId')=? AND json_extract(body,'$.origin')='CONTRACT_PURCHASE' AND julianday(json_extract(body,'$.acquiredAt'))<=julianday(?)").all(owner,item.type_id,at).some(row=>{const lot=JSON.parse(String(row.body)) as OriginLot;if(BigInt(lot.quantity)<BigInt(item.quantity)||lot.quality==='conflict')return false;const checked=currentConsumedOrigin(db,{lotId:lot.id,quantity:item.quantity,category:lot.category,origin:lot.origin,quality:lot.quality,costCents:null,evidence:lot.evidence,ruleVersion:lot.ruleVersion});if(checked.quality==='conflict')purchaseConflict=true;return checked.quality!=='conflict'&&checked.category==='TRADEPROFIT';});
  if(purchaseConflict&&!boughtContract)return {...segment,category:null,origin:'CONFLICT'};
  const category=acquired>=BigInt(item.quantity)||boughtContract?'TRADEPROFIT':segment.origin==='INDUSTRY'?'MISC':catalogActivity(item.type_id).category;
  if(!category)return segment;
  // Baseline liquidation and activity are orthogonal. Preserve legacy identity.
  const origin=segment.origin==='OPENING_STOCK'?'OPENING_STOCK':category==='TRADEPROFIT'?'Kaufhistorie (regelbasiert)':segment.origin==='INDUSTRY'?'INDUSTRY / Produktionsbeleg':'SDE '+category+' (regelbasiert)';
  return {...segment,category,origin,...(segment.origin==='OPENING_STOCK'?{basis:'rule_based' as const}:{})};
 });
}
