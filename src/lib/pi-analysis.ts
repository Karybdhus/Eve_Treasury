import {z} from 'zod';
import type {ProjectRecord} from './source-records';
import {Pin} from './esi/normalizers';
import {Money,cents,decimal} from './money';
export function storageSnapshot(pinRaw:unknown,metadata:ProjectRecord[]){
 const pin=Pin.parse(pinRaw),type=metadata.find(r=>r.kind==='type_metadata'&&r.sourceEntityId===pin.type_id),capacity=type?.data.capacity;
 if(typeof capacity!=='number'||capacity<=0||!pin.contents)return {capacity:null,volume:null,percent:null};
 let volume=0;for(const item of pin.contents){const m=metadata.find(r=>r.kind==='type_metadata'&&r.sourceEntityId===item.type_id),v=m?.data.volume;if(typeof v!=='number'||v<0)return {capacity,volume:null,percent:null};volume+=item.amount*v;}
 return {capacity,volume,percent:volume/capacity*100};
}
export const PiScenario=z.object({name:z.string().min(1).max(100),product:z.string().min(1).max(100),tier:z.enum(['P0','P1','P2','P3','P4']),plannedColonies:z.number().int().min(1).max(100),unitsPerColonyHour:z.number().finite().nonnegative().max(10000000),operatingHoursPerWeek:z.number().finite().min(0).max(168),unitPriceISK:Money.nullable(),weeklyOperatingCostsISK:Money.nullable(),notes:z.string().max(4000).default('')}).strict().refine(s=>s.unitPriceISK===null||s.plannedColonies*s.unitsPerColonyHour*s.operatingHoursPerWeek*Number(s.unitPriceISK)<=90000000000000,'Scenario revenue exceeds the supported amount range');
export function piScenarioAnalysis(raw:unknown){const s=PiScenario.parse(raw);const quantity=s.plannedColonies*s.unitsPerColonyHour*s.operatingHoursPerWeek;const revenue=s.unitPriceISK===null?null:decimal(BigInt(Math.round(quantity*100))*cents(s.unitPriceISK)/100n);return {...s,status:'plan' as const,quantityPerWeek:quantity,revenueISK:revenue,netISK:revenue===null||s.weeklyOperatingCostsISK===null?null:decimal(cents(revenue)-cents(s.weeklyOperatingCostsISK)),quality:'manual assumptions; no actual production or income'};}
