import type { Measure, Report } from './contracts';
import {dateKey} from './time';
export const project = { start: '2026-10-04', end: '2026-12-31', accounts: 5, monthlyPlex: 500, targets: {6:7875,12:13500} };
export const pillars = ['mining', 'pi', 'trading', 'industry'] as const;
export function known(v: Measure | undefined): v is number { return typeof v === 'number'; }
// Sum at cent precision. Missing operands never silently become zero.
export function sum(values: Measure[]): Measure {
  if (values.length === 0 || values.includes('not_reported')) return 'not_reported';
  if (values.includes('unknown')) return 'unknown';
  return Number(values.reduce<bigint>((a,v) => a + BigInt(Math.round((v as number)*100)),0n))/100;
}
export function difference(revenue: Measure, costs: Measure[]): Measure {
  const total = sum(costs);
  return known(revenue) && known(total) ? Number(BigInt(Math.round(revenue*100))-BigInt(Math.round(total*100)))/100 : revenue === 'unknown' || total === 'unknown' ? 'unknown' : 'not_reported';
}
export function profit(r: Report): Measure {
  if (r.provenance==='historical_seed' || r.status !== 'actual' || r.reportType !== 'daily') return 'not_reported';
  if(r.derivedNetProfit!==undefined)return r.derivedNetProfit;
  const d = r.data;
  if (!('realizedRevenue' in d)) return 'not_reported';
  if (d.kind === 'TradingDailyReport') return difference(d.realizedRevenue,[d.operatingCosts,d.costOfGoodsSold,d.brokerFees,d.salesTax,d.relistCosts]);
  if (d.kind === 'PiDailyReport') return difference(d.realizedRevenue,[d.operatingCosts,d.pocoCosts]);
  return difference(d.realizedRevenue,[d.operatingCosts]);
}
export function latest<K extends Report['data']['kind']>(reports: Report[], kind: K): Extract<Report, {data:{kind:K}}> | undefined {
  return reports.filter(r=>r.data.kind===kind && r.status==='actual' && r.provenance!=='historical_seed').sort((a,b)=>Date.parse(b.period.to)-Date.parse(a.period.to))[0] as Extract<Report,{data:{kind:K}}> | undefined;
}
export function daysRemaining(now: Date) { return Math.max(0, Math.ceil((Date.parse(`${project.end}T23:59:59.999+01:00`) - Math.max(now.getTime(),Date.parse(project.start+'T00:00:00+02:00')))/86400000)); }
export function funding(reports: Report[], now = new Date()) {
  const coordinator=latest(reports,'CoordinatorSnapshot');
  const goal=latest(reports,'PlexGoalSnapshot');
  const snapshot=goal&&(!coordinator||Date.parse(goal.period.to)>Date.parse(coordinator.period.to))?goal:coordinator;
  const d = snapshot?.data;
  const physical = d?.physicalPlex ?? 'not_reported';
  const released = d?.kind==='PlexGoalSnapshot'?d.iskAllocatedForPlex:d?.releasedPlexContribution ?? 'not_reported';
  const price = d?.plexUnitPrice ?? 'not_reported';
  const equivalent: Measure = known(physical) && known(released) && known(price) ? physical + released/price : 'not_reported';
  const days = daysRemaining(now);
  const targets = [6,12].map(months=>{
    const plex = project.targets[months as 6|12];
    const gap: Measure = known(physical) && known(released) && known(price) ? Math.max(0, (plex-physical)*price-released) : 'not_reported';
    return { months, plex, gap, weekly: known(gap) && days>0 ? gap/days*7 : 'not_reported' as Measure, progress: known(equivalent) ? Math.min(100,equivalent/plex*100) : 'not_reported' as Measure };
  });
  return { snapshot, physical, released, price, equivalent, freeLiquidity:coordinator?.data.freeLiquidity ?? 'not_reported', days, targets };
}
export function weekStart(date: string) {
  const d = new Date((date.length===10?date:dateKey(date))+'T00:00:00Z'); d.setUTCHours(0,0,0,0); d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7)); return d.toISOString().slice(0,10);
}
export function weekly(reports: Report[], now = new Date()) {
  const rows: {week:string; mining:Measure; pi:Measure; trading:Measure; industry:Measure; supplementary:Measure; total:Measure; knownSubtotal:Measure; complete:boolean}[] = [];
  for(let t=Date.parse(weekStart(project.start));t<=Math.min(now.getTime(),Date.parse(project.end+'T23:59:59+01:00'));t+=7*86400000) {
    const week = new Date(t).toISOString().slice(0,10);
    const days: string[]=[];
    for(let i=0;i<7;i++){const day=new Date(t+i*86400000).toISOString().slice(0,10); if(day>=project.start && day<=project.end && day<=dateKey(now))days.push(day);}
    const vals = [...pillars,'supplementary'].map(p=>{
      // Only complete daily aggregates contribute; snapshots and sessions are descriptive.
      const records=reports.filter(r=>r.pillar===p && r.status==='actual' && r.reportType==='daily' && r.provenance!=='historical_seed' && days.includes(dateKey(r.period.from,r.reportingTimezone??'UTC')));
      return records.length===days.length && days.length>0 ? sum(records.map(profit)) : 'not_reported' as Measure;
    });
    const actuals=reports.filter(r=>r.status==='actual' && r.reportType==='daily' && r.provenance!=='historical_seed' && days.includes(dateKey(r.period.from,r.reportingTimezone??'UTC'))).map(profit).filter(known);
    const total=sum(vals.slice(0,4));
    rows.push({week,mining:vals[0],pi:vals[1],trading:vals[2],industry:vals[3],supplementary:vals[4],total,knownSubtotal:sum(actuals),complete:known(total)});
  }
  return rows;
}
export function format(v: Measure | undefined, unit='ISK') {
  if (!known(v)) return v==='unknown' ? 'Unbekannt' : 'Nicht gemeldet';
  const abs=Math.abs(v); const divisor=abs>=1e9?1e9:abs>=1e6?1e6:1;
  return `${new Intl.NumberFormat('de-DE',{maximumFractionDigits:divisor===1?2:3}).format(v/divisor)}${divisor===1e9?' Mrd':divisor===1e6?' Mio':''}${unit?' '+unit:''}`;
}
