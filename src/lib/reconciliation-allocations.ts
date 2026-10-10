import {readWalletBinding} from './contract-wallet-state';
import {contractArchive} from './esi-contracts';
import type {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {FinancialSource} from './reconciliation';
import {signedCents} from './exact-money';
import {decimal} from './money';
export type Allocation={allocation_id:string;payment_key:string;target_key:string;amount_decimal:string;kind:'payout'|'aggregate'|'included_cost';status:'active'|'revoked';reason:string;created_at:string;revoked_at:string|null};
export function allocations(db:DatabaseSync){return db.prepare('SELECT * FROM evidence_allocations ORDER BY created_at,allocation_id').all().map(x=>({...x})) as Allocation[];}
export function allocationCapacity(source:FinancialSource){return source.amountISK===null?null:signedCents(source.amountISK);}
export function allocationState(db:DatabaseSync,sources:FinancialSource[]){
 const rows=allocations(db),active=rows.filter(a=>a.status==='active'),byKey=new Map(sources.map(s=>[s.key,s]));
 const targets=sources.filter(s=>active.some(a=>a.target_key===s.key)||s.role==='snapshot'&&s.identity?.startsWith('contract:')).map(s=>{
  const linked=active.filter(a=>a.target_key===s.key),sum=linked.reduce((n,a)=>n+signedCents(a.amount_decimal),0n),capacity=linked.length>0&&linked.every(a=>a.kind==='included_cost')?s.costsISK===null?null:signedCents(s.costsISK):allocationCapacity(s),invalid=linked.length>0&&(!s.eligible||linked.some(a=>!byKey.has(a.payment_key)));
  return {key:s.key,expectedISK:capacity===null?null:decimal(capacity),allocatedISK:decimal(sum),remainingISK:capacity===null?null:decimal(capacity-sum),status:invalid?'conflict':capacity===null?'unknown':sum>capacity?'overpayment':sum===0n?'open':sum===capacity?'complete':'partial'};
 });
 const payments=sources.filter(s=>active.some(a=>a.payment_key===s.key)).map(s=>{const sums=['payout','aggregate','included_cost'].map(kind=>active.filter(a=>a.payment_key===s.key&&a.kind===kind).reduce((n,a)=>n+signedCents(a.amount_decimal),0n)),used=sums.reduce((n,value)=>value>n?value:n,0n),capacity=allocationCapacity(s);return {key:s.key,allocatedISK:decimal(used),remainingISK:capacity===null?null:decimal(capacity-used),conflict:capacity===null||used>capacity||!creditEligible(s)};});
 const missing=active.filter(a=>!byKey.has(a.payment_key)||!byKey.has(a.target_key));
 return {rows,targets,payments,conflicts:targets.filter(t=>['overpayment','conflict'].includes(t.status)).length+payments.filter(p=>p.conflict).length+missing.length};
}
function creditEligible(s:FinancialSource){return s.eligible&&['actual','confirmed_payout'].includes(s.status)&&['cash','cost'].includes(s.role)&&!['INTERNAL_TRANSFER','PLEX_PURCHASE','TRADING_PURCHASE'].includes(s.category)&&(s.role==='cost'||!(s.raw&&typeof s.raw==='object'&&'amount' in s.raw)||signedCents(String((s.raw as {amount:unknown}).amount))>0n);}
const Input=z.object({payment:z.string().min(1).max(300),target:z.string().min(1).max(300),amountISK:z.string().regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/),kind:z.enum(['payout','aggregate','included_cost']),reason:z.string().trim().min(1).max(2000),paymentRevision:z.number().int().positive(),targetRevision:z.number().int().positive(),expectedContractRevision:z.number().int().nonnegative().optional()}).strict();
function source(db:DatabaseSync,key:string){const row=db.prepare('SELECT body FROM financial_sources WHERE source_key=? AND is_current=1').get(key) as {body:string}|undefined;if(!row)throw new Error('Current source missing');return JSON.parse(row.body) as FinancialSource;}
function bump(db:DatabaseSync,key:string,expected:number){const link=db.prepare('SELECT event_id FROM event_sources WHERE source_key=?').get(key) as {event_id:string}|undefined;if(!link||db.prepare('UPDATE economic_events SET revision=revision+1 WHERE event_id=? AND revision=?').run(link.event_id,expected).changes!==1)throw new Error('Evidence changed; reload before allocating');}
function audit(db:DatabaseSync,action:string,body:unknown){db.prepare('INSERT INTO reconciliation_audit VALUES (?,?,?,?)').run(randomUUID(),action,new Date().toISOString(),JSON.stringify(body));}
export function allocateEvidence(db:DatabaseSync,raw:unknown){
 const input=Input.parse(raw),n=signedCents(input.amountISK);if(n<=0n||input.payment===input.target)throw new Error('Positive allocation between different sources required');
 db.exec('BEGIN IMMEDIATE');try{
  const p=source(db,input.payment),t=source(db,input.target),links=db.prepare('SELECT event_id FROM event_sources WHERE source_key IN (?,?)').all(p.key,t.key) as {event_id:string}[];
  if(links.length!==2||links[0].event_id===links[1].event_id)throw new Error('Already the same event; allocation would duplicate evidence');
  if(!creditEligible(p)||!t.eligible)throw new Error('Source is not eligible cash evidence');
  if(input.kind==='payout'&&(!(t.role==='snapshot'&&t.identity?.startsWith('contract:')||t.source==='buyback')||p.role!=='cash'))throw new Error('Payout target must be a contract or buyback');
  if(input.kind==='payout'){
   const binding=readWalletBinding(db,p.key);if(binding?.active&&t.identity!=='contract:'+binding.contractId)throw new Error('Whole journal is reserved for another contract');
   if(input.expectedContractRevision!==undefined){const c=contractArchive(db).find(c=>c.key===t.key);if(!c?.completed||!c.candidate||c.revision!==input.expectedContractRevision)throw new Error('Contract changed; reload before confirming payment');}
   if(p.source==='esi'&&!['contract_price','contract_price_payment_corp','player_donation','corporation_payment','corporation_bulk_payment','corporation_account_withdrawal'].includes(String((p.raw as Record<string,unknown>).ref_type)))throw new Error('Bounty, market or other income cannot prove a buyback payment');
   if(p.characterId&&t.characterId&&p.characterId!==t.characterId)throw new Error('Payment owner does not match payout recipient');
  }
  if(input.kind==='aggregate'&&(t.role!=='report'||p.role!=='cash'))throw new Error('Aggregate target must be a report');
  if(input.kind==='included_cost'&&(p.role!=='cost'||t.role!=='cash'))throw new Error('Included cost requires expense evidence and cash target');
  const active=allocations(db).filter(a=>a.status==='active'),pc=allocationCapacity(p),tc=input.kind==='included_cost'?t.costsISK===null?null:signedCents(t.costsISK):allocationCapacity(t);
  const used=active.filter(a=>a.payment_key===p.key&&a.kind===input.kind).reduce((s,a)=>s+signedCents(a.amount_decimal),0n),covered=active.filter(a=>a.target_key===t.key&&a.kind===input.kind).reduce((s,a)=>s+signedCents(a.amount_decimal),0n);
  if(pc===null||tc===null)throw new Error('Unknown amount cannot be allocated');if(used+n>pc||covered+n>tc)throw new Error('Allocation exceeds payment or target capacity');
  bump(db,p.key,input.paymentRevision);bump(db,t.key,input.targetRevision);
  const id=randomUUID();db.prepare("INSERT INTO evidence_allocations VALUES (?,?,?,?,?,'active',?,?,NULL)").run(id,p.key,t.key,decimal(n),input.kind,input.reason,new Date().toISOString());audit(db,'allocate',{id,...input});db.exec('COMMIT');return id;
 }catch(e){db.exec('ROLLBACK');throw e;}
}
export function revokeAllocation(db:DatabaseSync,input:{id:string;reason:string;paymentRevision:number;targetRevision:number}){
 z.object({id:z.string().uuid(),reason:z.string().trim().min(1).max(2000),paymentRevision:z.number().int().positive(),targetRevision:z.number().int().positive()}).strict().parse(input);
 db.exec('BEGIN IMMEDIATE');try{const row=allocations(db).find(a=>a.allocation_id===input.id&&a.status==='active');if(!row)throw new Error('Active allocation missing');bump(db,row.payment_key,input.paymentRevision);bump(db,row.target_key,input.targetRevision);db.prepare("UPDATE evidence_allocations SET status='revoked',revoked_at=? WHERE allocation_id=?").run(new Date().toISOString(),input.id);audit(db,'revoke_allocation',{before:row,...input});db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
}
export function allocationProjection(db:DatabaseSync,sources:FinancialSource[]){
 const state=allocationState(db,sources),active=state.rows.filter(a=>a.status==='active'),suppressed=new Set<string>(),categories=new Map<string,FinancialSource['category']>();let unresolved=state.conflicts;
 for(const target of state.targets){const rows=active.filter(a=>a.target_key===target.key),s=sources.find(x=>x.key===target.key)!;
  if(rows.some(a=>a.kind==='aggregate'||a.kind==='payout'&&s.source==='buyback')){if(target.status==='complete'&&state.conflicts===0)suppressed.add(s.key);else unresolved++;}
  if(s.role==='snapshot'&&s.identity?.startsWith('contract:'))for(const a of rows.filter(a=>a.kind==='payout')){const p=sources.find(x=>x.key===a.payment_key);const total=active.filter(x=>x.payment_key===a.payment_key&&x.kind==='payout').reduce((n,x)=>n+signedCents(x.amount_decimal),0n);const cats=new Set(active.filter(x=>x.payment_key===a.payment_key&&x.kind==='payout').map(x=>sources.find(y=>y.key===x.target_key)?.category));if(p&&total===allocationCapacity(p)&&[...cats].every(c=>c?.startsWith('BUYBACK_'))&&s.category!=='UNKNOWN'&&state.conflicts===0)categories.set(p.key,cats.size===1?s.category:'BUYBACK_MIXED');else unresolved++;}
 }
 for(const p of state.payments){const rows=active.filter(a=>a.payment_key===p.key&&a.kind==='included_cost'),s=sources.find(x=>x.key===p.key)!;if(rows.length){const sum=rows.reduce((n,a)=>n+signedCents(a.amount_decimal),0n);if(sum===allocationCapacity(s)&&!p.conflict)suppressed.add(p.key);else unresolved++;}}
 return {suppressed,categories,unresolved,state};
}