import {economicLabels,type EconomicCategory} from './economic-categories';
export type DisplaySegment={id:string;recordId:string;quantity:string;category:EconomicCategory|null;origin?:string};
export function contractSegmentLabel(segment:DisplaySegment){return segment.origin==='OPENING_STOCK'?'Altbestandsliquidation':segment.category?economicLabels[segment.category]:'Ungeklaerte Herkunft';}
export function contractItemDisplayOrigin(item:{record_id:string;quantity:string;unknownQuantity:string|null;conflict:boolean},segments:DisplaySegment[]){
 const rows=segments.filter(s=>s.recordId===item.record_id);const continuous=!item.conflict&&rows.some(s=>s.id.startsWith('lot:')||s.id.startsWith('reserved:'))&&rows.reduce((n,s)=>n+BigInt(s.quantity),0n)===BigInt(item.quantity);
 if(!continuous)return {continuous:false,unknownQuantity:item.unknownQuantity,labels:[] as string[]};
 const unknown=rows.filter(s=>s.category===null&&s.origin!=='OPENING_STOCK').reduce((n,s)=>n+BigInt(s.quantity),0n);
 return {continuous:true,unknownQuantity:unknown.toString(),labels:[...new Set(rows.filter(s=>s.category!==null||s.origin==='OPENING_STOCK').map(contractSegmentLabel))]};
}
