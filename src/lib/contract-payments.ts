import type {DatabaseSync} from 'node:sqlite';
import {contractArchive} from './esi-contracts';
import {reconciliation} from './reconciliation';
import {allocateEvidence} from './reconciliation-allocations';
import {signedCents} from './exact-money';
export function contractPaymentEvidence(db:DatabaseSync){
 const contracts=contractArchive(db),state=reconciliation(db);
 return contracts.map(c=>({contractId:c.contractId,completed:c.completed,purpose:c.purpose,
 paid:state.allocation.rows.some(a=>a.status==='active'&&a.kind==='payout'&&a.target_key===c.key),
 payments:state.sources.filter(s=>s.role==='cash'&&s.source==='esi'&&s.eligible&&s.characterId===String(c.raw.issuer_id)&&s.amountISK!==null&&s.raw&&typeof s.raw==='object'&&'amount' in s.raw&&signedCents(String(s.raw.amount))>0n&&s.identity==='contract:'+c.contractId).map(s=>({key:s.key,date:s.date,amountISK:s.amountISK}))}));
}
export function confirmFullContractPayment(db:DatabaseSync,input:{contractId:string;paymentKey:string;reason:string;expectedRevision:number}){
 if(!input.reason?.trim())throw new Error('Evidence reason required');
 const c=contractArchive(db).find(c=>c.contractId===input.contractId);
 if(!c?.candidate||!c.completed||!c.category||!['AUTO_CONFIRMED','MANUALLY_CONFIRMED'].includes(c.quality))throw new Error('Completed classified Buyback required');
 if(c.revision!==input.expectedRevision)throw new Error('Contract changed; reload');
 const evidence=contractPaymentEvidence(db).find(e=>e.contractId===input.contractId)!,p=evidence.payments.find(p=>p.key===input.paymentKey);
 if(!p||!p.amountISK||c.expectedPayoutISK!==p.amountISK)throw new Error('Select one positive contract-scoped wallet credit matching the confirmed full payout');
 const state=reconciliation(db),existing=state.allocation.rows.filter(a=>a.status==='active'&&a.target_key===c.key&&a.kind==='payout');
 if(existing.length){if(existing.length===1&&existing[0].payment_key===p.key&&existing[0].amount_decimal===p.amountISK)return;throw new Error('Existing historical evidence requires review in Data / Imports');}
 const revision=(key:string)=>state.events.find(e=>e.event_id===state.links.find(l=>l.source_key===key)?.event_id)!.revision;
 allocateEvidence(db,{payment:p.key,target:c.key,amountISK:p.amountISK,kind:'payout',reason:input.reason,paymentRevision:revision(p.key),targetRevision:revision(c.key),expectedContractRevision:input.expectedRevision});
}

