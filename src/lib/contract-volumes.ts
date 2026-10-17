import {readWalletBinding,currentWalletBinding} from './contract-wallet-state';
import type {DatabaseSync} from 'node:sqlite';
import {contractManagement} from './contract-management';
import {effectiveContractSplit,splitSegments} from './contract-split-state';
import {proportionalCents,contractValuation} from './contract-valuation';
import {moneyFact,signedCents} from './exact-money';
import {decimal} from './money';
import {economicCategories,economicLabels,type EconomicCategory} from './economic-categories';
import {dateKey} from './time';
import {sourceAfterBaseline} from './baseline-financial-filter';
export type ContractVolumeFilter={from?:string;to?:string;characterId?:string|null;source?:string|null;baselineId?:string|null};
// Read-only offer projection. Never participates in financial reconciliation or wealth.
export function contractVolumes(db:DatabaseSync,filter:ContractVolumeFilter={}){
 const own=new Set(db.prepare('SELECT character_id FROM characters').all().map(r=>String(r.character_id)));
 const ids=db.prepare("SELECT DISTINCT source_entity_id FROM project_records WHERE kind='contract_archive' ORDER BY source_entity_id").all();
 const buckets=new Map<EconomicCategory,{paid:bigint;pending:bigint;legacy:bigint}>(economicCategories.map(c=>[c,{paid:0n,pending:0n,legacy:0n}]));
 let paid=0n,pending=0n,unknownPaid=0n,unknownPending=0n;const counts={all:ids.length,paid:0,pending:0,cancelled:0,unclear:0,classified:0};
 const rows:{contractId:string;status:string;kind:'paid'|'pending'|'cancelled'|'excluded'|'unclear';paidISK:string;pendingISK:string;reason:string;categories:EconomicCategory[];estimated:boolean}[]=[];
 if(filter.source&&filter.source!=='esi')return {hasData:false,counts,paidISK:'0.00',pendingISK:'0.00',totalISK:'0.00',unknownPaidISK:'0.00',unknownPendingISK:'0.00',categories:[],rows};
 for(const row of ids){const id=String(row.source_entity_id),c=contractManagement(db,id),owner=c.role==='issuer'?c.issuerId:c.acceptorId;if(filter.characterId&&owner!==filter.characterId)continue;
  const raw=JSON.parse(String(db.prepare("SELECT body FROM project_records WHERE kind='contract_archive' AND source_entity_id=? ORDER BY fetched_at DESC LIMIT 1").get(id)!.body));
  if(['deleted','cancelled','rejected','reversed','failed'].includes(c.status)){counts.cancelled++;rows.push({contractId:id,status:c.status,kind:'cancelled',paidISK:'0.00',pendingISK:'0.00',reason:'Nicht mehr realisierbares Angebot',categories:[],estimated:false});continue;}
  if(c.type!=='item_exchange'||c.direction!=='outgoing'||c.purpose!=='material_sale'||c.quality==='conflict'||c.role==='unknown'||c.role==='internal'||c.role==='issuer'&&own.has(c.assigneeId))continue;
  const receipts=db.prepare("SELECT deduplication_key,body FROM project_records WHERE kind='wallet_journal' AND source='esi' AND is_current=1 AND status='actual' AND data_quality!='historical_seed' AND source_character_id=? AND ((json_extract(body,'$.context_id_type')='contract_id' AND CAST(json_extract(body,'$.context_id') AS TEXT)=? AND json_extract(body,'$.ref_type') IN ('contract_price','contract_price_payment_corp')) OR EXISTS(SELECT 1 FROM app_settings w WHERE w.name='contract_wallet:'||project_records.deduplication_key AND json_extract(w.body,'$.contractId')=? AND json_extract(w.body,'$.active')=1))").all(owner,id,id).filter(r=>{const binding=readWalletBinding(db,String(r.deduplication_key));if(binding&&(!binding.active||!currentWalletBinding(binding,owner,JSON.parse(String(r.body)),raw,db)))return false;const d=JSON.parse(String(r.body)),amount=moneyFact(d.amount).value;return amount!==null&&signedCents(amount)>0n&&!(own.has(String(d.first_party_id))&&own.has(String(d.second_party_id)))&&Date.parse(d.date)>=Date.parse(c.dateIssued);});
  const receipt=receipts.length===1?receipts[0]:null,d=receipt?JSON.parse(String(receipt.body)):null;
  const requested=filter.baselineId?db.prepare("SELECT created_at FROM economic_baselines WHERE id=? AND kind IN ('opening','comparison')").get(filter.baselineId):null;if(filter.baselineId&&!requested)throw Error('Unknown financial comparison baseline');const entry=requested?db.prepare("SELECT b.created_at FROM economic_baselines b,json_each(b.body,'$.characterIds') c WHERE b.kind IN ('opening','entry') AND c.value=? ORDER BY julianday(b.created_at) DESC LIMIT 1").get(owner):null;const cutover=entry&&requested&&Date.parse(String(entry.created_at))>Date.parse(String(requested.created_at))?entry:requested;
  if(c.completed&&d){const day=dateKey(d.date);if(day>dateKey(new Date())||filter.from&&day<filter.from||filter.to&&day>filter.to||cutover&&!sourceAfterBaseline({date:day,raw:d},String(cutover.created_at)))continue;
   const amount=signedCents(moneyFact(d.amount).value!),split=effectiveContractSplit(db,String(receipt!.deduplication_key));paid+=amount;counts.paid++;const categories=new Set<EconomicCategory>();let classified=0n;
   if(split){for(const line of split.lines){if(line.category){const bucket=buckets.get(line.category)!;bucket.paid+=signedCents(line.amountISK);classified+=signedCents(line.amountISK);categories.add(line.category);if(line.origin==='OPENING_STOCK')bucket.legacy+=signedCents(line.amountISK);}}}
   unknownPaid+=amount-classified;if(classified===amount)counts.classified++;else counts.unclear++;
   rows.push({contractId:id,status:c.status,kind:'paid',paidISK:decimal(amount),pendingISK:'0.00',reason:classified===amount?'Echter Zahlungsbeleg und Warenzuordnung':'Zahlung belegt; Herkunft oder Verteilung noch unvollstaendig',categories:[...categories],estimated:!!(split?.automation?.evidence as {estimatedDistribution?:boolean})?.estimatedDistribution});continue;
  }
  if(['outstanding','in_progress'].includes(c.status)&&receipts.length===0){
   if(filter.to&&dateKey(c.dateIssued)>filter.to)continue;
   const price=moneyFact(raw.price).value,expired=typeof raw.date_expired==='string'&&Date.parse(raw.date_expired)<=Date.now();
   if(!price||signedCents(price)<=0n||expired||!c.items?.length)continue;
   try{const segments=splitSegments(db,id);if(!segments.length)throw Error('Warenpositionen fehlen');const valuation=contractValuation(db,id);const matching=valuation&&c.items.every(i=>{const v=valuation.lines.find(l=>l.recordId===i.record_id);return v?.valueISK!==null&&v?.typeId===i.type_id&&v?.quantity===i.quantity;});
    const weights=segments.map(s=>{const item=c.items!.find(i=>i.record_id===s.recordId)!,line=matching?valuation!.lines.find(l=>l.recordId===s.recordId):null;return {id:s.id,weight:line?signedCents(line.valueISK!)*BigInt(s.quantity)*1000000n/BigInt(item.quantity):BigInt(s.quantity)};});const parts=proportionalCents(price,weights),categories=new Set<EconomicCategory>();let classified=0n;
    for(const part of parts){const category=segments.find(s=>s.id===part.id)!.category;if(category){buckets.get(category)!.pending+=signedCents(part.amountISK);classified+=signedCents(part.amountISK);categories.add(category);}}
    pending+=signedCents(price);unknownPending+=signedCents(price)-classified;counts.pending++;if(classified===signedCents(price))counts.classified++;else counts.unclear++;
    rows.push({contractId:id,status:c.status,kind:'pending',paidISK:'0.00',pendingISK:price,reason:'Offener eigener Verkaufscontract; potenzieller Erloes, keine Forderungs- oder Vermoegensbuchung',categories:[...categories],estimated:categories.size>1});
   }catch(e){counts.unclear++;rows.push({contractId:id,status:c.status,kind:'unclear',paidISK:'0.00',pendingISK:'0.00',reason:e instanceof Error?e.message:'Warenbelege widersprechen sich',categories:[],estimated:false});}
  }else if(c.completed||receipts.length){counts.unclear++;rows.push({contractId:id,status:c.status,kind:'unclear',paidISK:'0.00',pendingISK:'0.00',reason:receipts.length>1?'Mehrere positive Zahlungsbelege':'Abschluss oder eindeutiger Zahlungsbeleg fehlt',categories:[],estimated:false});}
 }
 return {hasData:ids.length>0,counts,paidISK:decimal(paid),pendingISK:decimal(pending),totalISK:decimal(paid+pending),unknownPaidISK:decimal(unknownPaid),unknownPendingISK:decimal(unknownPending),categories:economicCategories.map(category=>{const b=buckets.get(category)!;return {category,label:economicLabels[category],paidISK:decimal(b.paid),pendingISK:decimal(b.pending),totalISK:decimal(b.paid+b.pending),legacyISK:decimal(b.legacy)};}),rows};
}
