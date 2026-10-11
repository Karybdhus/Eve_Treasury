import {marketOriginProjection} from './inventory-market-sales';
import {refundProjection} from './trading-refunds';
import {effectiveContractSplit} from './contract-split-state';
import type {DatabaseSync} from 'node:sqlite';
import {signedCents,exactSum,moneyFact} from './exact-money';
import {decimal} from './money';
import type {FinancialSource} from './reconciliation';

type TradingEvent={eventId:string;category:string;source:FinancialSource;facts:FinancialSource[];amountISK:string|null;costsISK:string|null;netISK:string|null;conflict:boolean};
// This is a projection of central events, never another ledger or estimated fee model.
export function tradingResult(db:DatabaseSync,events:TradingEvent[],allSources:FinancialSource[]=events.flatMap(e=>e.facts)){
 const refundState=refundProjection(db,allSources);const visibleKeys=new Set(events.flatMap(e=>e.facts.map(f=>f.key)));const refundConflicts=refundState.rows.filter(l=>!refundState.valid.some(v=>v.id===l.id)&&(visibleKeys.has(l.refundKey)||visibleKeys.has(l.feeKey))).length;const refunds=events.flatMap(e=>{const amount=exactSum(e.facts.flatMap(f=>refundState.amounts.has(f.key)?[refundState.amounts.get(f.key)!]:[]));return amount===null?[]:[{eventId:e.eventId,date:e.source.date,characterId:e.source.characterId,amountISK:amount,sourceKeys:e.facts.map(f=>f.key)}];});const received=refunds.reduce((n,r)=>n+signedCents(r.amountISK),0n);const unreviewedGm=events.filter(e=>e.category==='UNKNOWN'&&(e.source.raw as Record<string,unknown>)?.ref_type==='gm_cash_transfer'&&e.amountISK!==null).map(e=>decimal(signedCents(e.amountISK!)-e.facts.reduce((n,f)=>n+signedCents(refundState.amounts.get(f.key)??'0'),0n))).filter(v=>signedCents(v)>0n);
 const sales=events.filter(e=>e.category==='TRADING_SALE'&&!e.source.legacy).flatMap(e=>{const market=marketOriginProjection(db,e.facts.map(f=>f.key));if(!market)return [e];const lines=market.lines.filter(l=>l.category==='TRADEPROFIT');if(!lines.length)return [];
  const revenue=exactSum(lines.map(l=>l.amountISK));
  const basis=exactSum(lines.map(l=>l.costCents===null?null:decimal(BigInt(l.costCents))));
  const components=db.prepare("SELECT kind,treatment,amount_decimal FROM event_cost_components WHERE event_id=? AND kind IN ('fee','tax')").all(e.eventId) as {kind:string;treatment:string;amount_decimal:string|null}[];
  // Complete explicit fee and tax coverage is required; a missing row is not zero.
  // Mixed-origin fees need an explicit allocation rather than a guessed share.
  const coverage=market.lines.every(l=>l.category==='TRADEPROFIT')&&['fee','tax'].every(kind=>components.some(c=>c.kind===kind))&&components.every(c=>c.treatment!=='unknown'&&c.amount_decimal!==null);
  const separate=coverage?components.filter(c=>c.treatment==='separate').reduce((n,c)=>n+signedCents(c.amount_decimal!),0n):null;
  return [{...e,amountISK:revenue,netISK:revenue!==null&&basis!==null&&separate!==null?decimal(signedCents(revenue)-signedCents(basis)-separate):null,costsISK:basis!==null&&separate!==null?decimal(signedCents(basis)+separate):null}];});
 for(const e of events.filter(e=>e.category!=='TRADING_SALE'&&!e.source.legacy&&e.source.role!=='cost')){const splits=e.facts.map(f=>effectiveContractSplit(db,f.key)).filter(s=>s!==null);if(splits.length!==1)continue;const lines=splits[0].lines.filter(l=>l.category==='TRADEPROFIT');if(lines.length)sales.push({...e,amountISK:exactSum(lines.map(l=>l.amountISK)),netISK:exactSum(lines.map(l=>l.profitISK)),costsISK:lines.every(l=>l.profitISK!==null)?decimal(lines.reduce((n,l)=>n+signedCents(l.amountISK)-signedCents(l.profitISK!),0n)):null});}
 const fees=events.filter(e=>e.category==='TRADING_FEE'&&e.source.role==='cost');
 const active=db.prepare("SELECT payment_key,target_key,amount_decimal FROM evidence_allocations WHERE status='active' AND kind='included_cost'").all() as {payment_key:string;target_key:string;amount_decimal:string}[];
 const classify=(e:TradingEvent)=>{const types=e.facts.map(f=>String((f.raw as Record<string,unknown>)?.ref_type??''));return types.includes('transaction_tax')?'sales_tax':types.some(t=>['brokers_fee','contract_brokers_fee'].includes(t))?'broker_fee':'other';};
 const details=fees.map(e=>{
  const rows=active.filter(a=>e.facts.some(f=>f.key===a.payment_key));
  const covered=rows.reduce((n,a)=>n+signedCents(a.amount_decimal),0n);
  const targets=rows.map(a=>allSources.find(t=>t.key===a.target_key));
  // Partial or stale inclusion evidence cannot prove a second expense or a zero expense.
  const overlap=rows.length>0&&(e.amountISK===null||covered>signedCents(e.amountISK)||targets.some(t=>!t||!t.eligible||t.netISK===null));
  const effective=e.conflict||overlap||e.amountISK===null?null:decimal(signedCents(e.amountISK)-covered);
  return {eventId:e.eventId,date:e.source.date,characterId:e.source.characterId,kind:classify(e),amountISK:e.amountISK,alreadyIncludedISK:rows.length?decimal(covered):null,effectiveCostISK:effective,quality:overlap||e.conflict?'conflict':effective===null?'unknown':'proven',sourceKeys:e.facts.map(f=>f.key),orderId:String((e.source.raw as Record<string,unknown>)?.context_id_type)==='market_transaction_id'?String((e.source.raw as Record<string,unknown>).context_id):null};
 });
 const knownFees=details.filter(d=>d.effectiveCostISK!==null);
 const sum=(values:(string|null)[])=>exactSum(values);
 const revenue=sum(sales.map(e=>e.amountISK)),net=sum(sales.map(e=>e.netISK)),costs=sum(sales.map(e=>e.costsISK));
 const paid=sum(details.map(d=>d.amountISK)),additional=sum(details.map(d=>d.effectiveCostISK));
 const possibleOverlap=details.some(d=>d.effectiveCostISK!==null&&signedCents(d.effectiveCostISK)>0n&&sales.some(e=>e.facts.some(f=>{if(f.source!=='motor_market')return false;const raw=f.raw as Record<string,unknown>,fields=d.kind==='sales_tax'?['sales_tax_isk']:d.kind==='broker_fee'?['broker_fees_isk','relist_costs_isk']:['operating_costs_isk'];return fields.some(k=>{const value=moneyFact(raw[k]).value;return value!==null&&signedCents(value)>0n;});})));
 const conflict=refundConflicts>0||possibleOverlap||sales.some(e=>e.conflict)||details.some(d=>d.quality==='conflict');
 // No fee entries is lack of coverage, not proof of zero fees. Subtraction of the observed
 // subset is still useful, but is explicitly labelled partial in the UI.
 const result=!conflict&&net!==null?decimal(signedCents(net)-(additional===null&&details.length===0?0n:additional===null?0n:signedCents(additional))+received):null;
  const realizedEmbedded=active.filter(a=>sales.some(e=>e.facts.some(f=>f.key===a.target_key))).reduce((n,a)=>{const p=allSources.find(s=>s.key===a.payment_key);return n+(p?.eligible&&p.category==='TRADING_FEE'?signedCents(a.amount_decimal):0n);},0n);
 const period=conflict||details.some(d=>d.effectiveCostISK===null)||sales.some(e=>e.netISK===null)?null:sales.length||details.length||refunds.length?decimal((net===null?0n:signedCents(net))+realizedEmbedded-(paid===null?0n:signedCents(paid))+received):null;

 const basis=sales.length?sum(sales.map(e=>{
  const market=marketOriginProjection(db,e.facts.map(f=>f.key));if(market)return sum(market.lines.filter(l=>l.category==='TRADEPROFIT').map(l=>l.costCents===null?null:decimal(BigInt(l.costCents))));
  const split=e.facts.map(f=>effectiveContractSplit(db,f.key)).find(s=>s!==null);
  if(split){const lines=split.lines.filter(l=>l.category==='TRADEPROFIT');return sum(lines.map(l=>l.costCents===null?null:decimal(BigInt(l.costCents))));}
  const m=e.facts.find(f=>f.source==='motor_market');
  if(m)return moneyFact((m.raw as Record<string,unknown>)?.cost_basis_isk).value;
  return sum((db.prepare("SELECT amount_decimal FROM event_cost_components WHERE event_id=? AND kind='acquisition'").all(e.eventId) as {amount_decimal:string|null}[]).map(c=>c.amount_decimal));
 })):null; const margin=revenue!==null&&basis!==null?decimal(signedCents(revenue)-signedCents(basis)):null;
 const byType=(kind:string)=>{const rows=details.filter(d=>d.kind===kind);return rows.length?sum(rows.map(d=>d.amountISK)):null;};
 return {unreviewedGmCredits:unreviewedGm.length,unreviewedGmISK:exactSum(unreviewedGm),brokerRefundsISK:refunds.length?decimal(received):null,netBrokerFeesISK:byType('broker_fee')!==null||refunds.length?decimal((byType('broker_fee')===null?0n:signedCents(byType('broker_fee')!))-received):null,refundConflicts,refunds,revenueISK:revenue,acquisitionCostsISK:basis,marginBeforeFeesISK:margin,embeddedCostsISK:costs,realizedProfitBeforeUnallocatedFeesISK:net,brokerFeesISK:byType('broker_fee'),salesTaxISK:byType('sales_tax'),otherFeesISK:byType('other'),observedFeesISK:paid,additionalFeesISK:details.length?additional:null,tradeprofitISK:details.some(d=>d.effectiveCostISK===null)?null:result,periodResultISK:period,knownResultSubtotalISK:possibleOverlap?null:sales.some(e=>e.netISK!==null)||knownFees.length||refunds.length?decimal(sales.reduce((n,e)=>n+(e.netISK===null?0n:signedCents(e.netISK)),0n)-knownFees.reduce((n,d)=>n+signedCents(d.effectiveCostISK!),0n)+received):null,quality:conflict?'conflict':'partial',possibleFeeOverlap:possibleOverlap,unknownCostSales:sales.filter(e=>e.netISK===null).length,feeCoverage:'Only observed journal costs; missing history is unknown',feeCount:details.length,saleCount:sales.length,details};
}



