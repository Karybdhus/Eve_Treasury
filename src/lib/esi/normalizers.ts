import {z} from 'zod';
import type {ProjectRecord} from '../source-records';
import type {EsiResponse} from './client';
const id=z.union([z.number().int().nonnegative().safe(),z.string().regex(/^\d+$/)]).transform(String);
const number=z.number().finite(),quantity=number.nonnegative().safe(),timestamp=z.iso.datetime({offset:true});
export const MiningEntry=z.object({date:z.iso.date(),type_id:id,solar_system_id:id,quantity});
export const Planet=z.object({planet_id:id,solar_system_id:id,owner_id:id,planet_type:z.string(),upgrade_level:z.number().int(),num_pins:z.number().int(),last_update:timestamp});
export const Pin=z.object({pin_id:id,type_id:id,latitude:number,longitude:number,contents:z.array(z.object({type_id:id,amount:quantity})).optional(),expiry_time:timestamp.optional(),install_time:timestamp.optional(),last_cycle_start:timestamp.optional(),schematic_id:id.optional(),extractor_details:z.object({cycle_time:quantity.optional(),product_type_id:id.optional(),qty_per_cycle:quantity.optional(),heads:z.array(z.unknown())}).passthrough().optional(),factory_details:z.object({schematic_id:id}).optional()}).passthrough();
export const Layout=z.object({pins:z.array(Pin),links:z.array(z.unknown()),routes:z.array(z.unknown())});
export const JournalEntry=z.object({id,ref_type:z.string(),date:timestamp,description:z.string(),amount:number.optional(),first_party_id:id.optional(),second_party_id:id.optional(),tax:number.optional(),tax_receiver_id:id.optional(),context_id:id.optional(),context_id_type:z.string().optional()}).passthrough();
export const Transaction=z.object({transaction_id:id,journal_ref_id:id,type_id:id,date:timestamp,unit_price:number.nonnegative(),quantity,is_buy:z.boolean(),is_personal:z.boolean(),client_id:id,location_id:id}).passthrough();
export const IndustryJob=z.object({job_id:id,activity_id:id,blueprint_type_id:id,product_type_id:id.optional(),runs:quantity,cost:number.nonnegative().optional(),start_date:timestamp,end_date:timestamp,facility_id:id,status:z.string()}).passthrough();
export const Order=z.object({order_id:id,type_id:id,issued:timestamp,price:number.nonnegative(),volume_remain:quantity,is_buy_order:z.boolean().optional(),is_corporation:z.boolean(),escrow:number.nonnegative().optional()}).passthrough();
function record(kind:string,characterId:string,entityId:string,response:EsiResponse,data:Record<string,unknown>,sourceTimestamp?:string):ProjectRecord{
 return {kind,source:'esi',sourceClass:'automatic',sourceCharacterId:characterId,sourceEntityId:entityId,fetchedAt:response.fetchedAt,sourceTimestamp:sourceTimestamp??response.sourceTimestamp,dataQuality:'measured',status:'actual',deduplicationKey:'esi:'+characterId+':'+kind+':'+entityId,data};
}
export function miningRecords(characterId:string,response:EsiResponse){
 return z.array(MiningEntry).parse(response.data).map(d=>{
  // ESI quantity is cumulative for this UTC ledger bucket. Updates replace; never add.
  const entity=[d.date,d.type_id,d.solar_system_id].join(':');
  return {...record('mining_entry',characterId,entity,response,{characterId,typeId:d.type_id,quantity:d.quantity,solarSystemId:d.solar_system_id,sourceDate:d.date,sourceDateTimezone:'UTC',fleetHours:'not_reported',revenue:'not_reported'}),dataQuality:'partial' as const};
 });
}
export function colonyRecords(characterId:string,planetRaw:unknown,response:EsiResponse){
 const p=Planet.parse(planetRaw),layout=Layout.parse(response.data);
 const data={characterId,planetId:p.planet_id,planetType:p.planet_type,solarSystemId:p.solar_system_id,upgradeLevel:p.upgrade_level,lastUpdate:p.last_update,pins:layout.pins,links:layout.links,routes:layout.routes,storageUtilization:'unknown'};
 return [record('pi_colony',characterId,p.planet_id,response,data,p.last_update),...layout.pins.map(pin=>record('pi_pin',characterId,p.planet_id+':'+pin.pin_id,response,{...pin,planetId:p.planet_id},p.last_update))];
}
export function journalRecords(characterId:string,response:EsiResponse){
 return z.array(JournalEntry).parse(response.data).map(d=>record('wallet_journal',characterId,d.id,response,d,d.date));
}
export function transactionRecords(characterId:string,response:EsiResponse){
 return z.array(Transaction).parse(response.data).map(d=>record('wallet_transaction',characterId,d.transaction_id,response,d,d.date));
}
export function jobRecords(characterId:string,response:EsiResponse){
 return z.array(IndustryJob).parse(response.data).map(d=>record('industry_job',characterId,d.job_id,response,d,d.start_date));
}
export function orderRecords(characterId:string,response:EsiResponse){
 return z.array(Order).parse(response.data).map(d=>record('market_order',characterId,d.order_id,response,d,d.issued));
}
