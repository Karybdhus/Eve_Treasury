import type {Summary} from '@/lib/dashboard-statistics';
import type {funding} from '@/lib/accounting';
import type {walletObservations} from '@/lib/wallet-observations';
import {EconomicDashboardCharts} from './economic-dashboard-charts';
import {exactSum} from '@/lib/exact-money';
import {decimal} from '@/lib/money';
import {dateKey} from '@/lib/time';
import {signedCents} from '@/lib/exact-money';
export type SessionPoint={id:string;activity:string;date:string;hours:number|null;revenue:string|null;result:string|null};
export function EconomicDashboard({summary,wallet,goal,fleet,sessions,lastSync}:{summary:Summary;wallet:ReturnType<typeof walletObservations>;goal:ReturnType<typeof funding>;fleet:SessionPoint[];sessions:SessionPoint[];lastSync:string|null}){
 const days:string[]=[];for(let day=summary.filter.from<'2026-10-04'?'2026-10-04':summary.filter.from;day<=summary.filter.to&&day<='2026-12-31'&&day<=dateKey(new Date());){days.push(day);const next=new Date(day+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);day=next.toISOString().slice(0,10);}
 const timeline=days.map(day=>({day,activities:summary.economic.categories.map(c=>{const entries=summary.economic.entries.filter(e=>e.date===day&&e.category===c.category);const income=entries.flatMap(e=>e.incomeISK===null?[]:[e.incomeISK]),expense=entries.flatMap(e=>e.expenseISK===null?[]:[e.expenseISK]);return {category:c.category,incomeISK:exactSum(income),expenseISK:exactSum(expense),cashISK:entries.length?decimal(income.reduce((n,v)=>n+signedCents(v),0n)-expense.reduce((n,v)=>n+signedCents(v),0n)+entries.reduce((n,e)=>n+signedCents(e.costCorrectionISK??'0'),0n)):null};})}));
 return <EconomicDashboardCharts categories={summary.economic.categories} timeline={timeline} wallet={wallet} goal={goal} filter={summary.filter} quality={{unresolved:summary.unresolved,unknown:summary.unknown,income:summary.economic.unallocatedIncomeISK,expense:summary.economic.unallocatedExpenseISK,legacy:summary.legacyRevenueISK,openingLiquidation:summary.economic.openingLiquidationISK,projectResult:summary.projectSurplusISK,tradingResult:summary.trading.periodResultISK,tradingKnown:summary.trading.knownResultSubtotalISK,unreviewedGm:summary.trading.unreviewedGmISK,refunds:summary.trading.brokerRefundsISK,unknownSales:summary.trading.unknownCostSales}} sessions={[...fleet,...sessions]} lastSync={lastSync}/>;
}