import catalog from '../../seed/sde/industry-recipes.json';import type {ProjectRecord} from './source-records';
// A delivered job bounds possible new output; it does not prove input costs or a cash profit.
export function industryProductionEvidence(rows:ProjectRecord[],input:{owner:string;typeId:string;quantity:string;cutover:string;observedAt:string}){
 if(!/^[1-9][0-9]*$/.test(input.quantity))return [];
 const recipes=catalog.recipes as Record<string,{manufacturing?:{typeId:string;quantity:string}[];reaction?:{typeId:string;quantity:string}[]}>;
 const candidates=rows.filter(row=>{const d=row.data,at=String(d.completed_date??d.end_date),activity=String(d.activity_id)==='1'?'manufacturing':String(d.activity_id)==='11'?'reaction':null;return row.kind==='industry_job'&&row.source==='esi'&&row.status==='actual'&&row.dataQuality!=='historical_seed'&&row.sourceCharacterId===input.owner&&d.status==='delivered'&&activity!==null&&Date.parse(String(d.start_date))>Date.parse(input.cutover)&&Number.isFinite(Date.parse(at))&&Date.parse(at)<=Date.parse(input.observedAt)&&/^[1-9][0-9]*$/.test(String(d.runs))&&recipes[String(d.blueprint_type_id)]?.[activity]?.some(p=>p.typeId===input.typeId);});
 const capacity=candidates.reduce((n,row)=>{const activity=String(row.data.activity_id)==='1'?'manufacturing':'reaction';return n+BigInt(String(row.data.runs))*(recipes[String(row.data.blueprint_type_id)][activity]??[]).filter(p=>p.typeId===input.typeId).reduce((m,p)=>m+BigInt(p.quantity),0n);},0n);
 return BigInt(input.quantity)<=capacity?candidates.map(row=>row.deduplicationKey+':'+row.rawId):[];
}
