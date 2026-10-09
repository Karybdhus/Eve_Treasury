import type {ProjectRecord} from './source-records';
export function assetGroups(rows:ProjectRecord[]){
 const items=new Map<string,ProjectRecord>();
 for(const r of rows.filter(r=>r.kind==='asset_snapshot'&&r.isCurrent!==false&&r.status==='actual'&&r.dataQuality!=='historical_seed')){
  const id=String(r.data.item_id),old=items.get(id);
  if(!old||old.fetchedAt<r.fetchedAt)items.set(id,r);
 }
 const groups=new Map<string,{typeId:string;singleton:boolean;blueprint:boolean;quantity:bigint;unknown:boolean;positions:{owner:string;location:string;flag:string;quantity:string;asOf:string}[]}>();
 for(const r of items.values()){
  const d=r.data,typeId=String(d.type_id),singleton=d.is_singleton===true,blueprint=d.is_blueprint_copy===true||Number(d.quantity)<0;
  const key=[typeId,singleton?'unique:'+String(d.item_id):'stack',blueprint?'blueprint':'normal'].join(':');
  const group=groups.get(key)??{typeId,singleton,blueprint,quantity:0n,unknown:false,positions:[]};
  const valid=Number.isSafeInteger(Number(d.quantity))&&Number(d.quantity)>=0;
  if(valid)group.quantity+=BigInt(String(d.quantity));else group.unknown=true;
  group.positions.push({owner:r.sourceCharacterId??'',location:String(d.location_id),flag:String(d.location_flag),quantity:valid?String(d.quantity):'Unbekannt',asOf:r.sourceTimestamp??r.fetchedAt});groups.set(key,group);
 }
 return [...groups].map(([key,g])=>({...g,key,quantity:g.unknown?null:g.quantity.toString()}));
}
