import type {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {contractManagement} from './contract-management';
import {contractItemOrigins} from './contract-origins';
import {readWalletBinding,currentWalletBinding,walletFingerprint} from './contract-wallet-state';
import {readContractSplit,effectiveContractSplit,splitSegments} from './contract-split-state';
import {contractValuation,proposeContractSplit,proportionalCents} from './contract-valuation';
import {moneyFact,signedCents} from './exact-money';
export const contractAutomationVersion='13.1';
export type ContractAutomationPlan={contractId:string;version:string;status:'ready'|'manual'|'review'|'ineligible';issues:string[];contractRevision:number;paymentKey?:string;paymentRevision?:number;paymentFingerprint?:string;lines?:{id:string;amountISK:string}[];unallocatedISK?:string;evidenceHash:string};
// Read-only planning. Applying a plan requires separately tested revision guards.
export function planContractAutomation(db:DatabaseSync,id:string):ContractAutomationPlan{
 const c=contractManagement(db,id),plan:ContractAutomationPlan={contractId:id,version:contractAutomationVersion,status:'review',issues:[],contractRevision:c.revision,evidenceHash:''};
 const finish=()=>{plan.evidenceHash=createHash('sha256').update(JSON.stringify(plan)).digest('hex');return plan;};
 if(!c.completed||c.type!=='item_exchange'||!['issuer','acceptor'].includes(c.role)||c.direction!=='outgoing'||c.purpose!=='material_sale'||c.quality==='conflict'){plan.status='ineligible';return finish();}
 const purpose=db.prepare('SELECT body FROM app_settings WHERE name=?').get('contract_purpose:'+id) as {body:string}|undefined;
 if(purpose&&JSON.parse(purpose.body).management?.active===false){plan.issues.push('Manuelle Entscheidung widerrufen');return finish();}
 const owner=c.role==='issuer'?c.issuerId:c.acceptorId;
 const rows=db.prepare("SELECT deduplication_key,source_character_id,body FROM project_records WHERE kind='wallet_journal' AND is_current=1 AND status='actual' AND data_quality!='historical_seed' AND json_extract(body,'$.context_id_type')='contract_id' AND CAST(json_extract(body,'$.context_id') AS TEXT)=?").all(id) as {deduplication_key:string;source_character_id:string;body:string}[];
 const positive=rows.filter(r=>{const d=JSON.parse(r.body),amount=moneyFact(d.amount).value;return r.source_character_id===owner&&amount!==null&&signedCents(amount)>0n;});
 if(positive.length!==1){plan.issues.push(positive.length?'Mehrere Zahlungsbelege':'Zahlungsbeleg fehlt');return finish();}
 const row=positive[0],d=JSON.parse(row.body),key=row.deduplication_key;if(!['contract_price','contract_price_payment_corp'].includes(d.ref_type)){plan.issues.push('Journal-Referenz nicht fuer Automatik zugelassen');return finish();}
 const own=new Set((db.prepare('SELECT character_id FROM characters').all() as {character_id:string}[]).map(r=>r.character_id));
 if(!Number.isFinite(Date.parse(d.date))||Date.parse(d.date)<Date.parse(c.dateIssued)||own.has(String(d.first_party_id))&&own.has(String(d.second_party_id))){plan.issues.push('Unzulaessiger Geldfluss oder Belegzeitpunkt');return finish();}
 const binding=readWalletBinding(db,key),raw=db.prepare("SELECT body FROM project_records WHERE kind='contract_archive' AND source_entity_id=?").get(id) as {body:string};
 if(binding&&(binding.contractId!==id||binding.component!=='item_sale'||!currentWalletBinding(binding,owner,d,JSON.parse(raw.body),db))){plan.issues.push('Zahlung widerrufen oder geaendert');return finish();}
 if(!binding&&(db.prepare("SELECT 1 FROM evidence_allocations WHERE status='active' AND (payment_key=? OR target_key=?)").get(key,key)||db.prepare('SELECT 1 FROM buyback_wallet_links WHERE journal_key=?').get(key)||db.prepare('SELECT 1 FROM buyback_bookings WHERE contract_id=?').get(id))){plan.issues.push('Historische Belegkapazitaet bereits verwendet');return finish();}
 plan.paymentKey=key;plan.paymentFingerprint=walletFingerprint(owner,d);plan.paymentRevision=Number(db.prepare('SELECT e.revision FROM economic_events e JOIN event_sources s ON e.event_id=s.event_id WHERE s.source_key=?').get(key)?.revision??0);
 const prior=readContractSplit(db,key);
 if(prior){if(signedCents(prior.unallocatedISK)>0n)plan.issues.push('Warenherkunft oder Erloesanteil offen');plan.status=effectiveContractSplit(db,key)?'manual':'review';if(plan.status==='review')plan.issues.push('Erloesverteilung widerrufen oder Herkunft geaendert');return finish();}
 const items=contractItemOrigins(db,id).filter(i=>i.direction==='outgoing');
 if(items.some(i=>i.conflict)){plan.issues.push('Herkunftskonflikt');return finish();}
 const segments=splitSegments(db,id);if(!segments.length){plan.issues.push('Warenpositionen fehlen');return finish();}
 const categories=new Set(segments.map(s=>s.category)),payout=moneyFact(d.amount).value!;
 if(categories.size===1&&!categories.has(null)){
  // Same-category aggregate income is exact; these shares are not unit prices.
  plan.lines=proportionalCents(payout,segments.map(s=>({id:s.id,weight:BigInt(s.quantity)})));plan.unallocatedISK='0.00';
 }else{
  const valuation=contractValuation(db,id);
  if(!valuation||items.some(i=>{const v=valuation.lines.find(l=>l.recordId===i.record_id);return !v||(v.source??valuation.source)!=='manual'||v.valueISK===null||v.typeId!==i.type_id||v.quantity!==i.quantity;})){if(categories.has(null))plan.issues.push('Warenherkunft fehlt');plan.issues.push('Bestaetigte Einzelpositionsbewertung fehlt');return finish();}
  try{const lines=proposeContractSplit(db,id,payout).lines;plan.lines=lines.filter(l=>l.category!==null).map(l=>({id:l.id,amountISK:l.amountISK}));const unknown=lines.filter(l=>l.category===null).reduce((n,l)=>n+signedCents(l.amountISK),0n);plan.unallocatedISK=(unknown/100n)+'.'+(unknown%100n).toString().padStart(2,'0');if(unknown>0n)plan.issues.push('Ungeklaerter Erloesanteil');}catch{plan.issues.push('Bewertung nicht aufteilbar');return finish();}
 }
 plan.status='ready';return finish();
}
