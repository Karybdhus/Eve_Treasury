import {exactSum,signedCents,compatibilityNumber,moneyFact} from '../exact-money';
import type {ProjectRecord} from '../source-records';
import type {Measure} from '../contracts';
import {sum} from '../accounting';
const bounties=new Set(['bounty_prizes']);
const bountyTaxes=new Set(['bounty_prize_corporation_tax','npc_bounty_security_tax']);
export function classifyJournal(row:Record<string,unknown>,projectCharacterIds:Set<string>,walletOwner?:string){
 const type=String(row.ref_type);
 const delta=moneyFact(row.amount).value,positive=delta!==null&&signedCents(delta)>0n;
 const owned=walletOwner!==undefined&&projectCharacterIds.has(walletOwner);
 if(type==='ess_escrow_transfer')return {category:positive&&owned&&row.context_id_type==='system_id'&&/^\d+$/.test(String(row.context_id??''))?'ess_realized':'ess_unvalidated',quality:positive&&owned&&row.context_id_type==='system_id'?'measured':'partial'};
 if(bounties.has(type))return {category:positive?'ratting_bounty':'bounty_unvalidated',quality:positive?'measured':'unknown'};
 if(bountyTaxes.has(type))return {category:delta!==null&&signedCents(delta)<0n?'ratting_tax':'bounty_tax_unvalidated',quality:delta!==null&&signedCents(delta)<0n?'measured':'unknown'};
 if(type==='player_donation'||type==='corporation_account_withdrawal'||type==='corporation_payment'||type==='contract_price'||type==='contract_price_payment_corp'){
  const both=projectCharacterIds.has(String(row.first_party_id))&&projectCharacterIds.has(String(row.second_party_id));
  return {category:both?'internal_transfer':'transfer_unresolved',quality:both?'measured':'unknown'};
 }
 if(type==='market_transaction')return {category:'market_transaction',quality:'partial'};
 if(['brokers_fee','contract_brokers_fee'].includes(type))return {category:owned&&delta!==null&&signedCents(delta)<0n?'broker_fee':'fee_unvalidated',quality:owned&&delta!==null&&signedCents(delta)<0n?'measured':'unknown'};
 if(type==='transaction_tax')return {category:owned&&delta!==null&&signedCents(delta)<0n?'sales_tax':'fee_unvalidated',quality:owned&&delta!==null&&signedCents(delta)<0n?'measured':'unknown'};
 if(['planetary_import_tax','planetary_export_tax'].includes(type))return {category:'poco_tax',quality:'measured'};
 if(['manufacturing','reaction','copying','industry_job_tax','industry_security_tax','factory_slot_rental_fee','researching_material_productivity','researching_time_productivity','researching_technology','reverse_engineering'].includes(type))return {category:'industry_fee',quality:'measured'};
 if(type.endsWith('_corporation_tax')||type==='corporate_reward_tax')return {category:'corporation_tax',quality:'partial'};
 return {category:'unclassified',quality:'unknown'};
}
export function rattingEvidence(records:ProjectRecord[],projectCharacterIds:Set<string>){
 const selected=records.filter(r=>r.kind==='wallet_journal'&&r.status==='actual');
 const classified=selected.map(r=>({record:r,...classifyJournal(r.data,projectCharacterIds,r.sourceCharacterId)}));
 const bounty=classified.filter(r=>r.category==='ratting_bounty'),tax=classified.filter(r=>r.category==='ratting_tax');
 // Journal amounts are already wallet deltas. The informational tax field is never subtracted twice.
 const amount=(r:typeof classified[number]):Measure=>compatibilityNumber(moneyFact(r.record.data.amount).value);
 const realizedEss=classified.filter(r=>r.category==='ess_realized'),bountyISK=exactSum(bounty.map(r=>moneyFact(r.record.data.amount).value)),essISK=exactSum(realizedEss.map(r=>moneyFact(r.record.data.amount).value));
 return {realizedBountyISK:bountyISK,realizedEssISK:essISK,realizedTotalISK:exactSum([...(bountyISK!==null?[bountyISK]:[]),...(essISK!==null?[essISK]:[])]),pendingEssISK:null,stolenEssISK:null,reservePersonalIncomeISK:null,bankObservationQuality:'UNKNOWN',measuredNet:sum([...bounty,...tax].map(amount)),bountyEntries:bounty.length,taxEntries:tax.length,essEntries:classified.filter(r=>r.category==='ess_unvalidated').length,completeness:'partial' as const,classes:classified};
}
