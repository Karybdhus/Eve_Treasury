import {applyContinuousContractOrigins} from './inventory-contract-sales';
import type {DatabaseSync} from 'node:sqlite';
import {applyContractAutomation} from './contract-automation';
import {planContractAutomation} from './contract-automation-plan';
import {applyAutomaticOrigins} from './contract-automation-origins';
import {contractManagement} from './contract-management';
export function automaticContractReconciliation(db:DatabaseSync,owners:string[],onlyIds?:string[]){
 if(onlyIds?.length===0)return [];const ids=db.prepare("SELECT source_entity_id FROM project_records WHERE kind='contract_archive'"+(onlyIds?" AND source_entity_id IN ("+onlyIds.map(()=>'?').join(',')+")":'')+" GROUP BY source_entity_id ORDER BY MIN(json_extract(body,'$.date_issued')),source_entity_id").all(...(onlyIds??[])) as {source_entity_id:string}[];
 return ids.flatMap(({source_entity_id:id})=>{const c=contractManagement(db,id);if(onlyIds&&!onlyIds.includes(id))return [];if(!owners.includes(c.role==='issuer'?c.issuerId:c.acceptorId))return [];const before=planContractAutomation(db,id);if(!before.paymentKey||before.status==='manual'||before.status==='ineligible')return [{contractId:id,applied:false,issues:before.issues}];try{if(!applyContinuousContractOrigins(db,id))applyAutomaticOrigins(db,id);const payment=applyContractAutomation(db,id);if(payment.applied)return [{contractId:id,applied:true,issues:payment.plan.issues}];if(!applyContinuousContractOrigins(db,id))applyAutomaticOrigins(db,id);const result=applyContractAutomation(db,id);return [{contractId:id,applied:result.applied,issues:result.plan.issues}];}catch{return [{contractId:id,applied:false,issues:['Beleg- oder Revisionskonflikt; Ausnahme pruefen']}];}});
}
export function successfulContractOwners(steps:{characterId:string;source:string;status:string}[]){return [...new Set(steps.map(s=>s.characterId))].filter(id=>steps.filter(s=>s.characterId===id).every(s=>!['error','running','pending','interrupted','authorization_missing'].includes(s.status))&&['wallet','contracts'].every(source=>steps.some(s=>s.characterId===id&&s.source===source&&s.status==='success')));}
