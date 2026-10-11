import {signedCents} from './exact-money';
import {decimal} from './money';
import {splitSegments} from './contract-split-state';
import type {DatabaseSync} from 'node:sqlite';
import {planContractAutomation,contractAutomationVersion} from './contract-automation-plan';
import {contractManagement} from './contract-management';
import {decideContractWallet} from './contract-wallet';
import {readWalletBinding} from './contract-wallet-state';
import {decideContractSplit} from './contract-split';
import {reconciliation} from './reconciliation';
function revision(db:DatabaseSync,key:string){reconciliation(db);return Number(db.prepare('SELECT e.revision FROM economic_events e JOIN event_sources s ON e.event_id=s.event_id WHERE s.source_key=?').get(key)!.revision);}
export function applyContractAutomation(db:DatabaseSync,id:string,expectedHash?:string){
 const plan=planContractAutomation(db,id);if(expectedHash&&plan.evidenceHash!==expectedHash)throw new Error('Automation evidence changed; replan');
 if(['manual','ineligible'].includes(plan.status)||!plan.paymentKey)return {plan,applied:false};
 const key=plan.paymentKey,reason='Automatic proven receipt and origins; rule '+contractAutomationVersion;
 // Reuse the existing decision APIs and their ownership/capacity/revision checks.
 if(!readWalletBinding(db,key))decideContractWallet(db,{contractId:id,contractRevision:plan.contractRevision,paymentKey:key,paymentRevision:revision(db,key),action:'confirm',component:'item_sale',reason},{version:contractAutomationVersion,evidenceHash:plan.evidenceHash,evidence:plan});
 const current=planContractAutomation(db,id);if(current.status!=='ready'||current.paymentKey!==key)return {plan:current,applied:false};
 const segments=splitSegments(db,id),costs=db.prepare("SELECT kind,treatment,amount_decimal FROM event_cost_components WHERE event_id=(SELECT event_id FROM event_sources WHERE source_key=?) AND kind IN ('fee','tax')").all(key) as {kind:string;treatment:string;amount_decimal:string|null}[];
 const knownCosts=segments.filter(s=>s.category==='TRADEPROFIT').length===1&&['fee','tax'].every(kind=>costs.some(c=>c.kind===kind))&&costs.every(c=>c.treatment!=='unknown'&&c.amount_decimal!==null)?decimal(costs.reduce((n,c)=>n+signedCents(c.amount_decimal!),0n)):null;
 decideContractSplit(db,{contractId:id,contractRevision:contractManagement(db,id).revision,paymentKey:key,paymentRevision:revision(db,key),action:'confirm',reason,lines:current.lines,unallocatedISK:current.unallocatedISK,additionalTradeCostsISK:knownCosts},{version:contractAutomationVersion,evidenceHash:current.evidenceHash,evidence:current});
 return {plan:current,applied:true};
}
