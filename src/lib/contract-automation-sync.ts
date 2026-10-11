import {readContractSplit} from './contract-split-state';
import type {DatabaseSync} from 'node:sqlite';
import {applyContractAutomation} from './contract-automation';
import {planContractAutomation} from './contract-automation-plan';
import {applyAutomaticOrigins} from './contract-automation-origins';
import {contractManagement} from './contract-management';
export function automaticContractReconciliation(db:DatabaseSync,owners:string[]){
 const ids=db.prepare("SELECT DISTINCT source_entity_id FROM project_records WHERE kind='contract_archive'").all() as {source_entity_id:string}[];
 return ids.flatMap(({source_entity_id:id})=>{const c=contractManagement(db,id);if(!owners.includes(c.role==='issuer'?c.issuerId:c.acceptorId))return [];const before=planContractAutomation(db,id);if(!before.paymentKey||readContractSplit(db,before.paymentKey)||before.status==='manual'||before.status==='ineligible')return [{contractId:id,applied:false,issues:before.issues}];try{const payment=applyContractAutomation(db,id);if(payment.applied)return [{contractId:id,applied:true,issues:payment.plan.issues}];applyAutomaticOrigins(db,id);const result=applyContractAutomation(db,id);return [{contractId:id,applied:result.applied,issues:result.plan.issues}];}catch{return [{contractId:id,applied:false,issues:['Beleg- oder Revisionskonflikt; Ausnahme pruefen']}];}});
}
export function successfulContractOwners(steps:{characterId:string;source:string;status:string}[]){return [...new Set(steps.map(s=>s.characterId))].filter(id=>steps.filter(s=>s.characterId===id).every(s=>!['error','running','pending','interrupted','authorization_missing'].includes(s.status))&&['wallet','contracts'].every(source=>steps.some(s=>s.characterId===id&&s.source===source&&s.status==='success')));}
