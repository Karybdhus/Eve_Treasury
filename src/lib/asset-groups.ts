import {assetLocation} from './asset-locations';
import type {ProjectRecord} from './source-records';
export function assetGroups(rows:ProjectRecord[]){
 const items=new Map<string,ProjectRecord>();const ambiguous=new Set<string>();
 for(const r of rows.filter(r=>r.kind==='asset_snapshot'&&r.isCurrent!==false&&r.status==='actual'&&r.dataQuality!=='historical_seed')){
  const id=String(r.data.item_id),old=items.get(id);
  if(!old||old.fetchedAt<r.fetchedAt){items.set(id,r);ambiguous.delete(id);}else if(old.fetchedAt===r.fetchedAt&&JSON.stringify([old.sourceCharacterId,old.data])!==JSON.stringify([r.sourceCharacterId,r.data]))ambiguous.add(id);
 }
 const groups=new Map<string,{typeId:string;singleton:boolean;blueprint:boolean;quantity:bigint;unknown:boolean;positions:{itemId:string;owner:string;location:string;flag:string;quantity:string;asOf:string;rootLocation:string|null;containers:{itemId:string;typeId:string}[];locationUnknown:boolean}[]}>();
 for(const r of items.values()){
  const d=r.data,typeId=String(d.type_id),singleton=d.is_singleton===true,blueprint=d.is_blueprint_copy===true||Number(d.quantity)<0;
  const key=[typeId,singleton?'unique:'+String(d.item_id):'stack',blueprint?'blueprint':'normal'].join(':');
  const group=groups.get(key)??{typeId,singleton,blueprint,quantity:0n,unknown:false,positions:[]};
  const valid=!ambiguous.has(String(d.item_id))&&(typeof d.quantity==='number'?Number.isSafeInteger(d.quantity)&&d.quantity>=0:typeof d.quantity==='string'&&/^(0|[1-9][0-9]*)$/.test(d.quantity));
  if(valid)group.quantity+=BigInt(String(d.quantity));else group.unknown=true;
  group.positions.push({...assetLocation(r,items),itemId:String(d.item_id),owner:r.sourceCharacterId??'',location:String(d.location_id),flag:String(d.location_flag),quantity:valid?String(d.quantity):'Unbekannt',asOf:r.sourceTimestamp??r.fetchedAt});groups.set(key,group);
 }
 return [...groups].map(([key,g])=>({...g,key,quantity:g.unknown?null:g.quantity.toString()}));
}
