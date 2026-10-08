import type {DatabaseSync} from 'node:sqlite';
import {exactJson,moneyFact,type MoneyFact} from './exact-money';
const fields=new Set(['realizedRevenue','operatingCosts','internalTransfers','plexPurchases','derivedNetProfit','netProfit','realizedTradingProfit','grossRevenue','directCosts','costs','grossBuys','grossSales','costOfGoodsSold','brokerFees','salesTax','relistCosts','relistFees','legacyLiquidationRevenue','legacyLiquidationCostBasis','legacyLiquidationFees','legacyLiquidationNet','averageCapitalEmployed','wallet','buyEscrow','escrow','inventoryCostBasis','sellOrderCostBasis','openSellOrderAskValue','reportedCapitalBound','capitalBound','freeLiquidity','releasedPlexContribution','iskAllocatedForPlex','plexUnitPrice','iskPerPlex','pocoCosts','pocoTaxes','importExportCosts','materialCosts','jobFees','structureFees','logisticsCosts','amount','tax','balance','unit_price','cost','price']);
export function writeMoneyFacts(db:DatabaseSync,key:string,body:unknown,raw?:string) {
 let original:unknown;try{original=raw?exactJson(raw):undefined;}catch{}
 const values=new Map<string,MoneyFact>();
 function visit(value:unknown,path:string,lexical:unknown){
  if(!value||typeof value!=='object')return;
  for(const [name,v] of Object.entries(value)){
   const p=path?path+'.'+name:name,lex=lexical&&typeof lexical==='object'?(lexical as Record<string,unknown>)[name]:name==='wallet'&&typeof lexical==='string'?lexical:undefined;
   if(fields.has(name))values.set(p,typeof v==='number'&&moneyFact(v).quality==='precision_unknown'&&raw&&path.startsWith('data')?moneyFact(v):moneyFact(lex??v));
   else if(v&&typeof v==='object')visit(v,p,lex);
  }
 }
 if(Array.isArray(original)&&body&&typeof body==='object'){const d=body as Record<string,unknown>;original=original.find(x=>x&&typeof x==='object'&&['id','transaction_id','job_id','order_id'].some(k=>String((x as Record<string,unknown>)[k])===String(d[k])&&d[k]!==undefined));}
 visit(body,'',original);
 for(const [field,fact] of values)db.prepare('INSERT INTO financial_money VALUES (?,?,?,?) ON CONFLICT(source_key,field) DO UPDATE SET value_decimal=excluded.value_decimal,quality=excluded.quality').run(key,field,fact.value,fact.quality);
}
export function fact(db:DatabaseSync,key:string,field:string,fallback?:unknown):MoneyFact {
 const row=db.prepare('SELECT value_decimal AS value,quality FROM financial_money WHERE source_key=? AND field=?').get(key,field) as MoneyFact|undefined;
 return row??moneyFact(fallback);
}
export function backfillMoneyFacts(db:DatabaseSync){
 const reportRows=db.prepare('SELECT r.report_id,r.body,s.raw_body FROM reports r LEFT JOIN imported_source_reports s USING(report_id)').all() as {report_id:string;body:string;raw_body:string|null}[];
 for(const r of reportRows)writeMoneyFacts(db,'report:'+r.report_id,JSON.parse(r.body),r.raw_body??undefined);
 const rows=db.prepare('SELECT p.deduplication_key,p.body,p.source_entity_id,r.payload_text FROM project_records p LEFT JOIN raw_source_records r ON r.raw_id=p.raw_id').all() as {deduplication_key:string;body:string;source_entity_id:string|null;payload_text:string|null}[];
 for(const r of rows){
  let raw:string|undefined;try{const body=r.payload_text?exactJson(r.payload_text):null;const matched=Array.isArray(body)?body.find(x=>x&&typeof x==='object'&&Object.values(x).some(v=>v===r.source_entity_id)):body;if(matched)raw=JSON.stringify(matched);}catch{}
  writeMoneyFacts(db,r.deduplication_key,JSON.parse(r.body),raw);
 }
 db.prepare("UPDATE reported_profit_decimal SET quality='legacy_precision_unverified' WHERE report_id IN (SELECT report_id FROM reported_profit)").run();
}
