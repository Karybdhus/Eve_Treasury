import {exactSum,moneyFact} from './exact-money';
import type {ProjectRecord} from './source-records';
import type {consolidatedFinancials} from './reconciliation';
export type Summary=ReturnType<typeof consolidatedFinancials>;
export const goodsLabels:Record<string,string>={BUYBACK_MINING:'MINING_ICE',BUYBACK_PI:'PI',BUYBACK_RATLOOT:'LOOT',BUYBACK_SALVAGE:'SALVAGE',BUYBACK_HACKING:'HACKING',BUYBACK_MIXED:'MIXED / nicht aufgeteilt'};
export function walletLiquidity(rows:ProjectRecord[]){
 const latest=new Map<string,ProjectRecord>();
 for(const r of rows.filter(r=>r.kind==='wallet_balance'&&r.status==='actual'&&r.dataQuality!=='historical_seed')){
 const key=r.sourceCharacterId??r.deduplicationKey,old=latest.get(key);
 if(!old||old.fetchedAt<r.fetchedAt)latest.set(key,r);
 }
 return {amountISK:exactSum([...latest.values()].map(r=>moneyFact(r.data.wallet).value)),count:latest.size,stale:[...latest.values()].some(r=>r.connectionStatus==='disconnected')};
}
export function realizedStatistics(summary:Summary){
 const relevant=summary.events.filter(e=>!e.conflict&&!e.legacy&&!['INTERNAL_TRANSFER','PLEX_PURCHASE','TRADING_PURCHASE','UNKNOWN','TRADING_FEE','OPERATING_COST','INDUSTRY_COST','SERVICE_COST','MISC_COST','CAPITAL_TRANSFER'].includes(e.category));
 const ambiguous=summary.unresolved>0;
 const bounty=summary.events.filter(e=>!e.conflict&&['RATTING_BOUNTY','ESS_INCOME'].includes(e.category));
 const other=relevant.filter(e=>!e.category.startsWith('BUYBACK_')&&!e.sources.some(s=>s.startsWith('buyback:'))&&!['RATTING_BOUNTY','ESS_INCOME','TRADING_SALE'].includes(e.category));
 return {grossRevenueISK:ambiguous?null:exactSum(relevant.map(e=>e.amountISK)),bountiesISK:exactSum(bounty.map(e=>e.amountISK)),otherRevenueISK:ambiguous?null:exactSum(other.map(e=>e.amountISK)),
 costs:summary.events.filter(e=>['TRADING_FEE','OPERATING_COST','INDUSTRY_COST','SERVICE_COST','MISC_COST'].includes(e.category)||e.costsISK!==null),
 buybacks:summary.events.filter(e=>(e.category.startsWith('BUYBACK_')||e.sources.some(s=>s.startsWith('buyback:')))&&!e.conflict)};
}
export function buybackPeriods(summary:Summary,grain:'week'|'month'|'year'){
 const rows=realizedStatistics(summary).buybacks,groups=new Map<string,typeof rows>();
 for(const row of rows){if(!row.date)continue;const d=new Date(row.date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));const period=grain==='week'?d.toISOString().slice(0,10):row.date.slice(0,grain==='month'?7:4),key=period+'|'+row.category;groups.set(key,[...(groups.get(key)??[]),row]);}
 return [...groups.entries()].map(([key,events])=>({period:key.split('|')[0],category:goodsLabels[events[0].category]??'MIXED / nicht aufgeteilt',amountISK:summary.unresolved?null:exactSum(events.map(e=>e.amountISK)),costsISK:exactSum(events.map(e=>e.costsISK)),netISK:exactSum(events.map(e=>e.netISK)),events})).sort((a,b)=>b.period.localeCompare(a.period));
}
