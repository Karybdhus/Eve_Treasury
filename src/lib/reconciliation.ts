import {reconciliationCandidates} from './reconciliation-candidates';
import type {DatabaseSync} from 'node:sqlite';
import {detachFinancialSource} from './reconciliation-links';
import {randomUUID} from 'node:crypto';
import {listBuybacks,inProject} from './buyback';
import {records,sha} from './source-records';
import {readReports} from './db';
import {fact,writeMoneyFacts} from './financial-facts';
import {exactJson,moneyFact,exactSum,signedCents} from './exact-money';
import {decimal} from './money';
import {dateKey} from './time';
import {project,weekStart} from './accounting';
import {classifyJournal} from './esi/classification';
import {readSettings} from './settings';
export const financialCategories=['BUYBACK_MINING','BUYBACK_PI','BUYBACK_RATLOOT','BUYBACK_HACKING','BUYBACK_SALVAGE','TRADING_SALE','TRADING_PURCHASE','TRADING_FEE','RATTING_BOUNTY','INDUSTRY_COST','OTHER_INCOME','OPERATING_COST','INTERNAL_TRANSFER','PLEX_PURCHASE','UNKNOWN'] as const;
export type FinancialCategory=typeof financialCategories[number];
export type FinancialSource={key:string;source:string;sourceId:string;characterId:string|null;date:string|null;category:FinancialCategory;amountISK:string|null;costsISK:string|null;netISK:string|null;status:string;precision:string;eligible:boolean;role:'cash'|'report'|'cost'|'snapshot'|'production';identity:string|null;references:string[];legacy:boolean;complete:boolean;raw:unknown};
type Link={source_key:string;event_id:string;method:string;evidence:string;confirmed_at:string;manual:number};
export type Match={pairKey:string;left:string;right:string;reason:string;status:'proposal'|'conflict'|'rejected'};
const pair=(a:string,b:string)=>[a,b].sort().join('|');
const categories:Record<string,FinancialCategory>={ore_ice:'BUYBACK_MINING',pi:'BUYBACK_PI',ratloot:'BUYBACK_RATLOOT',hacking:'BUYBACK_HACKING',salvage:'BUYBACK_SALVAGE'};
function audit(db:DatabaseSync,action:string,data:unknown){db.prepare('INSERT INTO reconciliation_audit VALUES (?,?,?,?)').run(randomUUID(),action,new Date().toISOString(),JSON.stringify(data));}
export function collectFinancialSources(db:DatabaseSync):FinancialSource[]{
 const settings=readSettings(db),out:FinancialSource[]=[];
 const owned=new Set((db.prepare('SELECT character_id FROM characters').all() as {character_id:string}[]).map(x=>x.character_id));
 for(const b of listBuybacks(db)){
  const costs=exactSum(b.lines.map(l=>l.operatingCostsISK)),value=b.actualPayoutISK;
  out.push({key:'buyback:'+b.bookingId,source:'buyback',sourceId:b.bookingId,characterId:b.characterId??null,date:b.payoutDate??null,category:b.lines.length===1?categories[b.lines[0].category]??'OTHER_INCOME':'OTHER_INCOME',amountISK:value,costsISK:costs,netISK:value!==null&&costs!==null?decimal(signedCents(value)-signedCents(costs)):null,status:b.reportingStatus,precision:'exact',eligible:settings.sources.buyback&&inProject(b),role:'cash',identity:b.contractId?'contract:'+b.contractId:null,references:[],legacy:false,complete:value!==null,raw:b});
 }
 for(const r of records(db)){
  if(!['wallet_journal','wallet_transaction','motor_trade','industry_job','mining_entry','pi_colony','pi_pin','market_order','wallet_snapshot','wallet_balance'].includes(r.kind))continue;
  const d=r.data,key=r.deduplicationKey;let raw:unknown=d;
  if(r.rawId){const original=db.prepare('SELECT payload_text FROM raw_source_records WHERE raw_id=?').get(r.rawId) as {payload_text:string}|undefined;if(original)try{const all=exactJson(original.payload_text);raw=Array.isArray(all)?all.find(x=>x&&typeof x==='object'&&['id','transaction_id','job_id','order_id'].some(k=>(x as Record<string,unknown>)[k]===r.sourceEntityId))??d:all;writeMoneyFacts(db,key,d,JSON.stringify(raw));}catch{}}
  const get=(field:string)=>fact(db,key,field,d[field]).value,timestamp=String(d.date??d.timestamp??d.start_date??r.sourceTimestamp??''),day=timestamp&&Number.isFinite(Date.parse(timestamp))?dateKey(timestamp):null;
  let references:string[]=[];let category:FinancialCategory='UNKNOWN',amount:string|null=null,cost:string|null=null,net:string|null=null,role:FinancialSource['role']='cash',identity:string|null=null,legacy=false,complete=true;
  if(r.kind==='motor_trade'){
   category=d.side==='buy'?'TRADING_PURCHASE':'TRADING_SALE';amount=moneyFact(d.gross_isk).value;legacy=d.goods_origin==='legacy';
   if(d.side==='sell'&&['purchased','legacy'].includes(String(d.goods_origin))&&d.cost_basis_reference)cost=exactSum([d.cost_basis_isk,d.broker_fees_isk,d.sales_tax_isk,d.relist_costs_isk,d.operating_costs_isk].map(x=>moneyFact(x).value));
   net=amount!==null&&cost!==null?decimal(signedCents(amount)-signedCents(cost)):null;identity=d.source_transaction_id?'transaction:'+r.sourceCharacterId+':'+d.source_transaction_id:null;
  }else if(r.kind==='wallet_transaction'){
   category=d.is_buy?'TRADING_PURCHASE':'TRADING_SALE';const price=get('unit_price');
   amount=price!==null&&Number.isSafeInteger(Number(d.quantity))?decimal(signedCents(price)*BigInt(String(d.quantity))):null;identity='transaction:'+r.sourceCharacterId+':'+d.transaction_id;references=d.journal_ref_id?['journal:'+r.sourceCharacterId+':'+d.journal_ref_id]:[];
  }else if(r.kind==='wallet_journal'){
   const cls=classifyJournal(d,owned),delta=get('amount');
   category=cls.category==='internal_transfer'?'INTERNAL_TRANSFER':cls.category==='ratting_bounty'?'RATTING_BOUNTY':['broker_fee','sales_tax'].includes(cls.category)?'TRADING_FEE':['industry_fee','poco_tax','ratting_tax'].includes(cls.category)?cls.category==='industry_fee'?'INDUSTRY_COST':'OPERATING_COST':'UNKNOWN';
   amount=delta!==null?decimal(signedCents(delta)<0n?-signedCents(delta):signedCents(delta)):null;
   if(['TRADING_FEE','OPERATING_COST','INDUSTRY_COST'].includes(category)){role='cost';cost=amount;}
   if(category==='INTERNAL_TRANSFER')identity='transfer:'+d.id;
   if(d.ref_type==='market_transaction'){category=delta!==null&&signedCents(delta)<0n?'TRADING_PURCHASE':'TRADING_SALE';identity='journal:'+r.sourceCharacterId+':'+d.id;}
   if(d.ref_type==='contract_price'&&d.context_id_type==='contract_id'&&d.context_id)identity='contract:'+d.context_id;
   if(category==='RATTING_BOUNTY')net=amount;
   if(delta!==null&&signedCents(delta)<0n&&role==='cash'&&category!=='INTERNAL_TRANSFER'){category='UNKNOWN';complete=false;}
  }else if(r.kind==='industry_job'){role='cost';category='INDUSTRY_COST';amount=get('cost');cost=amount;complete=false;}
  else {role=['mining_entry','pi_colony','pi_pin'].includes(r.kind)?'production':'snapshot';complete=false;}
  const precise=['amount','unit_price','cost'].some(field=>fact(db,key,field,d[field]).quality==='precision_unknown');
  out.push({key,source:r.source,sourceId:r.sourceEntityId??key,characterId:r.sourceCharacterId??null,date:day,category,amountISK:amount,costsISK:cost,netISK:net,status:r.status,precision:precise?'precision_unknown':'exact_or_legacy',eligible:settings.sources[r.source as keyof typeof settings.sources]!==false&&r.status==='actual'&&day!==null&&day>=project.start&&day<=project.end&&day<=dateKey(new Date()),role,identity,references,legacy,complete:complete&&amount!==null,raw});
 }
 for(const {report:r} of readReports(db)){
  const original=db.prepare('SELECT raw_body FROM imported_source_reports WHERE report_id=?').get(r.reportId) as {raw_body:string}|undefined,raw=original?exactJson(original.raw_body):r as unknown;
  const lexicalData=(raw as {data:Record<string,unknown>}).data,legacyData=original?JSON.parse(original.raw_body).data:undefined,sourceData=Object.fromEntries(Object.entries(lexicalData).map(([k,v])=>[k,legacyData&&typeof legacyData[k]==='number'&&moneyFact(legacyData[k]).quality==='precision_unknown'?null:v])),d=r.data as Record<string,unknown>,standard=typeof sourceData.kind!=='string',get=(field:string,alias=field)=>moneyFact(sourceData[alias]??d[field]).value;
  let amount=get('realizedRevenue',standard&&r.pillar==='trading'?'grossSales':'realizedRevenue');
  const costKeys=r.pillar==='trading'?['operatingCosts','costOfGoodsSold','brokerFees','salesTax','relistCosts']:r.pillar==='pi'?['operatingCosts','pocoCosts']:['operatingCosts'];
  const aliases:Record<string,string>={operatingCosts:r.pillar==='mining'?'costs':r.pillar==='pi'?'importExportCosts':'operatingCosts',pocoCosts:'pocoTaxes',relistCosts:'relistFees'};
  let costs=exactSum(costKeys.map(k=>get(k,standard?aliases[k]??k:k)));
  if(standard&&r.pillar==='trading'&&(sourceData.costBasisVerified!==true||sourceData.goodsOrigin!=='purchased'))costs=null;
  if(standard&&r.pillar==='supplementary'){const activities=Array.isArray(sourceData.activities)?sourceData.activities as Record<string,unknown>[]:[];amount=exactSum(activities.map(a=>moneyFact(a.grossRevenue).value));costs=exactSum(activities.map(a=>moneyFact(a.directCosts).value));}
  const net=amount!==null&&costs!==null?decimal(signedCents(amount)-signedCents(costs)):null,role=r.reportType==='snapshot'?'snapshot':r.reportType==='session'?'production':'report',day=dateKey(r.period.from,r.reportingTimezone??'UTC');
  out.push({key:'report:'+r.reportId,source:r.source,sourceId:r.reportId,characterId:null,date:day,category:r.pillar==='trading'?'TRADING_SALE':r.pillar==='mining'?'BUYBACK_MINING':r.pillar==='pi'?'BUYBACK_PI':'OTHER_INCOME',amountISK:amount,costsISK:costs,netISK:net,status:r.status,precision:original?'raw_lexical':'legacy_numeric',eligible:settings.sources[r.source as keyof typeof settings.sources]!==false&&r.status==='actual'&&r.provenance!=='historical_seed'&&r.reportType==='daily'&&day>=project.start&&dateKey(r.period.to,r.reportingTimezone??'UTC')<=project.end,role,identity:null,references:[...(r.sourceTransactionIds??[]),...(r.evidenceReferences??[])],legacy:false,complete:amount!==null,raw});
 }
 return out;
}
function eventFor(db:DatabaseSync,s:FinancialSource){
 const existing=db.prepare('SELECT event_id FROM event_sources WHERE source_key=?').get(s.key) as {event_id:string}|undefined;if(existing)return existing.event_id;
 const id='event:'+sha(s.key),now=new Date().toISOString();db.prepare('INSERT OR IGNORE INTO economic_events VALUES (?,?,1,?)').run(id,s.category,now);
 db.prepare('INSERT INTO event_sources VALUES (?,?,?,?,?,0)').run(s.key,id,'source_identity','Stable source key',now);return id;
}
function compatible(a:FinancialSource,b:FinancialSource){
 return !(a.date&&b.date&&a.date!==b.date)&&!(a.raw&&b.raw&&typeof a.raw==='object'&&typeof b.raw==='object'&&(a.raw as Record<string,unknown>).type_id!==undefined&&(b.raw as Record<string,unknown>).type_id!==undefined&&String((a.raw as Record<string,unknown>).type_id)!==String((b.raw as Record<string,unknown>).type_id))&&!(a.role==='cash'&&a.category==='UNKNOWN'&&moneyFact((a.raw as Record<string,unknown>)?.amount).value?.startsWith('-'))&&!(b.role==='cash'&&b.category==='UNKNOWN'&&moneyFact((b.raw as Record<string,unknown>)?.amount).value?.startsWith('-'))&&!['production','snapshot'].includes(a.role)&&!['production','snapshot'].includes(b.role)&&a.amountISK!==null&&a.amountISK===b.amountISK&&(!a.characterId||!b.characterId||a.characterId===b.characterId||a.category==='INTERNAL_TRANSFER')&&(a.category==='INTERNAL_TRANSFER'||b.category==='INTERNAL_TRANSFER'?a.category===b.category:true)&&((a.role==='cost')===(b.role==='cost'))&&(a.netISK===null||b.netISK===null||a.netISK===b.netISK)&&(a.category==='TRADING_PURCHASE'||b.category==='TRADING_PURCHASE'?a.category===b.category:true);
}
function merge(db:DatabaseSync,a:FinancialSource,b:FinancialSource,method:string,evidence:string,manual:boolean){
 if(!compatible(a,b))throw new Error('Conflicting amount, character, role or known costs. Correct classification/evidence before linking.');
 const first=eventFor(db,a),second=eventFor(db,b);if(first===second)return;
 const old=db.prepare('SELECT * FROM event_sources WHERE event_id IN (?,?)').all(first,second),rows=db.prepare('SELECT s.body FROM financial_sources s JOIN event_sources l USING(source_key) WHERE l.event_id IN (?,?) AND s.is_current=1').all(first,second) as {body:string}[],facts=rows.map(x=>JSON.parse(x.body) as FinancialSource);
 if(facts.some(x=>facts.some(y=>!compatible(x,y))))throw new Error('Existing event evidence conflicts');
 db.prepare('UPDATE event_sources SET event_id=?,method=?,evidence=?,confirmed_at=?,manual=? WHERE event_id IN (?,?)').run(first,method,evidence,new Date().toISOString(),manual?1:0,first,second);
 db.prepare('UPDATE economic_events SET revision=revision+1 WHERE event_id IN (?,?)').run(first,second);
 audit(db,'link',{previous:old,eventId:first,sources:facts.map(f=>f.key),method,evidence,manual});
}
export function reconciliation(db:DatabaseSync){
 db.exec('BEGIN IMMEDIATE');try{
  const sources=collectFinancialSources(db);db.prepare('UPDATE financial_sources SET is_current=0').run();
  for(const s of sources){db.prepare('INSERT INTO financial_sources VALUES (?,?,1) ON CONFLICT(source_key) DO UPDATE SET body=excluded.body,is_current=1').run(s.key,JSON.stringify(s));eventFor(db,s);}
  const decisions=new Map((db.prepare('SELECT pair_key,status FROM reconciliation_decisions').all() as {pair_key:string;status:string}[]).map(x=>[x.pair_key,x.status])),proposals:Match[]=[];
  const walletRows=db.prepare('SELECT journal_key,booking_id FROM buyback_wallet_links').all() as {journal_key:string;booking_id:string}[];
  const walletByJournal=new Map(walletRows.map(row=>[row.journal_key,row]));
  const identityCounts=new Map<string,number>();for(const source of sources)if(source.eligible&&source.identity!==null)identityCounts.set(source.identity,(identityCounts.get(source.identity)??0)+1);
  for(const [i,j] of reconciliationCandidates(sources,walletRows)){
   const a=sources[i],b=sources[j];if(!a.eligible||!b.eligible||eventFor(db,a)===eventFor(db,b))continue;
   const pairKey=pair(a.key,b.key),rejected=decisions.get(pairKey)==='rejected',wallet=walletByJournal.get(a.source==='esi'?a.key:b.key);
   const explicit=wallet&&'buyback:'+wallet.booking_id===(a.source==='buyback'?a.key:b.key),strong=(a.identity!==null&&a.identity===b.identity||a.role!=='report'&&b.role!=='report'&&(a.references.includes(b.identity??'')||b.references.includes(a.identity??'')))&&a.role!=='report'&&b.role!=='report';
   const ambiguous=strong&&a.identity?.startsWith('contract:')&&(identityCounts.get(a.identity)??0)>2;
   if(ambiguous&&!rejected){proposals.push({pairKey,left:a.key,right:b.key,reason:'Contract identity has multiple payments; explicit allocation required',status:'conflict'});continue;}
   if((strong||explicit)&&!rejected){if(compatible(a,b)){merge(db,a,b,explicit?'existing_manual_wallet_link':'strong_source_identifier',explicit?'Existing confirmed wallet link':a.identity!,!!explicit);continue;}proposals.push({pairKey,left:a.key,right:b.key,reason:'Strong identifier conflicts with financial facts',status:'conflict'});continue;}
   const refs=a.references.some(r=>[b.key,b.sourceId,b.identity].includes(r))||b.references.some(r=>[a.key,a.sourceId,a.identity].includes(r)),amountDate=a.amountISK!==null&&signedCents(a.amountISK)>0n&&a.amountISK===b.amountISK&&a.date!==null&&a.date===b.date;
   if(refs||amountDate)proposals.push({pairKey,left:a.key,right:b.key,reason:refs?'Report reference needs whole-event confirmation':'Amount/date alone is insufficient',status:rejected?'rejected':compatible(a,b)?'proposal':'conflict'});
  }
  const links=db.prepare('SELECT * FROM event_sources').all().map(row=>({...row})) as Link[],events=db.prepare('SELECT * FROM economic_events').all().map(row=>({...row})) as {event_id:string;category:FinancialCategory;revision:number;created_at:string}[];db.exec('COMMIT');return {sources,links,events,proposals};
 }catch(e){db.exec('ROLLBACK');throw e;}
}
export function decideReconciliation(db:DatabaseSync,input:{action:'link'|'reject'|'unlink'|'classify';left:string;right?:string;category?:FinancialCategory;reason:string;expectedRevision?:number}){
 if(!input.reason.trim()||input.reason.length>2000)throw new Error('Provide an evidence reason (1-2000 characters)');
 reconciliation(db);db.exec('BEGIN IMMEDIATE');try{
  const fresh=collectFinancialSources(db);for(const s of fresh)db.prepare('UPDATE financial_sources SET body=? WHERE source_key=?').run(JSON.stringify(s),s.key);
  const a=fresh.find(s=>s.key===input.left),b=fresh.find(s=>s.key===input.right);if(!a)throw new Error('Source not found');
  if(input.action==='link'){if(!b)throw new Error('Second source not found');merge(db,a,b,'manual_confirmation',input.reason,true);db.prepare('DELETE FROM reconciliation_decisions WHERE pair_key=?').run(pair(a.key,b.key));}
  if(input.action==='reject'){if(!b)throw new Error('Second source not found');if(eventFor(db,a)===eventFor(db,b))throw new Error('Already linked. Use unlink before rejecting evidence.');db.prepare("INSERT INTO reconciliation_decisions VALUES (?,'rejected',?,?) ON CONFLICT(pair_key) DO UPDATE SET status=excluded.status,reason=excluded.reason,changed_at=excluded.changed_at").run(pair(a.key,b.key),input.reason,new Date().toISOString());audit(db,'reject',input);}
  if(input.action==='unlink'){detachFinancialSource(db,a.key,input.reason);}
  if(input.action==='classify'){
   if(!input.category||!financialCategories.includes(input.category))throw new Error('Unknown category');
   const link=db.prepare('SELECT event_id FROM event_sources WHERE source_key=?').get(a.key) as Link,result=db.prepare('UPDATE economic_events SET category=?,revision=revision+1 WHERE event_id=? AND revision=?').run(input.category,link.event_id,input.expectedRevision??-1);
   if(result.changes!==1)throw new Error('Event changed. Reload before classifying.');audit(db,'classify',{...input,eventId:link.event_id});
  }
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}return reconciliation(db);
}
export function consolidatedFinancials(db:DatabaseSync,filter:{from?:string;to?:string;characterId?:string;source?:string}={}){
 const state=reconciliation(db),from=filter.from??project.start,to=filter.to??project.end;
 const selected=state.sources.filter(s=>s.eligible&&!['production','snapshot'].includes(s.role)&&(s.date?s.date>=from&&s.date<=to:s.source==='buyback'&&(s.raw as {weekStart:string}).weekStart>=from&&(s.raw as {weekEnd:string}).weekEnd<=to)&&(!filter.characterId||s.characterId===filter.characterId)&&(!filter.source||s.source===filter.source)),keys=new Set(selected.map(s=>s.key));
 const events=state.events.flatMap(e=>{
  const facts=selected.filter(s=>state.links.some(l=>l.source_key===s.key&&l.event_id===e.event_id)),ordered=[...facts].sort((a,b)=>(a.source==='buyback'?-10:a.source==='motor_market'?-5:0)-(b.source==='buyback'?-10:b.source==='motor_market'?-5:0)),s=ordered[0];if(!s)return [];
  const conflict=facts.some(f=>facts.some(g=>f.key!==g.key&&!compatible(f,g))),override=(db.prepare("SELECT body FROM reconciliation_audit WHERE action='classify' ORDER BY changed_at DESC").all() as {body:string}[]).some(a=>JSON.parse(a.body).eventId===e.event_id);
  return [{eventId:e.event_id,category:override?e.category:s.category,source:s,facts,conflict,amountISK:conflict?null:s.amountISK,netISK:conflict?null:ordered.find(f=>f.netISK!==null)?.netISK??null,costsISK:conflict?null:ordered.find(f=>f.costsISK!==null)?.costsISK??null}];
 });
 const cash=events.filter(e=>['cash','report'].includes(e.source.role)&&!['INTERNAL_TRANSFER','PLEX_PURCHASE','TRADING_PURCHASE','UNKNOWN'].includes(e.category)),pending=state.proposals.filter(p=>p.status!=='rejected'&&(keys.has(p.left)||keys.has(p.right))),unknown=events.filter(e=>e.conflict||e.category==='UNKNOWN'&&['cash','cost','report'].includes(e.source.role)||e.source.precision==='precision_unknown'||!e.source.complete);
 const value=(rows:typeof events,key:'amountISK'|'netISK'|'costsISK')=>exactSum(rows.map(e=>e[key])),buybacks=cash.filter(e=>e.facts.some(f=>f.source==='buyback')),trades=cash.filter(e=>e.category==='TRADING_SALE'&&!e.source.legacy&&!buybacks.includes(e)),legacy=cash.filter(e=>e.category==='TRADING_SALE'&&e.source.legacy),other=cash.filter(e=>!buybacks.includes(e)&&!trades.includes(e)&&!legacy.includes(e)),expenses=events.filter(e=>e.source.role==='cost'&&!e.conflict);
 const aggregateOverlap=events.some(e=>e.source.role==='report'&&e.facts.length===1)&&events.some(e=>e.source.role==='cash');
 const costOverlap=expenses.length>0&&cash.some(e=>e.costsISK!==null);
 const operatingCash=cash.filter(e=>!e.source.legacy);
 const complete=cash.length>0&&!aggregateOverlap&&!costOverlap&&pending.length===0&&unknown.length===0&&operatingCash.every(e=>e.netISK!==null)&&expenses.every(e=>e.amountISK!==null&&e.source.complete),surplus=complete&&operatingCash.length?decimal(operatingCash.reduce((n,e)=>n+signedCents(e.netISK!),0n)-expenses.reduce((n,e)=>n+signedCents(e.amountISK!),0n)):null;
 const weeks=[...new Set(events.flatMap(e=>e.source.date?[weekStart(e.source.date)]:[]))].sort().map(week=>{const inWeek=(e:typeof events[number])=>!!e.source.date&&weekStart(e.source.date)===week;const wcash=operatingCash.filter(inWeek),wexpenses=expenses.filter(inWeek);return {week,eventCount:events.filter(inWeek).length,buybackRevenueISK:value(buybacks.filter(inWeek),'amountISK'),tradingNetISK:pending.length?null:value(trades.filter(inWeek),'netISK'),otherRevenueISK:value(other.filter(inWeek),'amountISK'),projectSurplusISK:complete&&wcash.length?decimal(wcash.reduce((n,e)=>n+signedCents(e.netISK!),0n)-wexpenses.reduce((n,e)=>n+signedCents(e.amountISK!),0n)):null};});
 return {filter:{from,to,characterId:filter.characterId??null,source:filter.source??null},buybackRevenueISK:value(buybacks,'amountISK'),tradingNetISK:pending.length?null:value(trades,'netISK'),legacyRevenueISK:value(legacy,'amountISK'),legacyNetISK:value(legacy,'netISK'),otherRevenueISK:pending.length||aggregateOverlap?null:value(other,'amountISK'),knownCostsSubtotalISK:pending.length||aggregateOverlap||costOverlap?null:exactSum([...cash,...expenses].map(e=>e.costsISK).filter((v):v is string=>v!==null)),projectSurplusISK:surplus,quality:complete?'verified_scope':'incomplete',unresolved:pending.length+(aggregateOverlap?1:0)+(costOverlap?1:0),unknown:unknown.length,eventCount:events.length,weeks,events:events.map(e=>({eventId:e.eventId,category:e.category,date:e.source.date,amountISK:e.amountISK,costsISK:e.costsISK,netISK:e.netISK,conflict:e.conflict,sources:e.facts.map(f=>f.key)})),policy:'One event per confirmed evidence group. Unresolved overlaps suppress surplus; snapshots, plans, production and transfers are excluded.'};
}
