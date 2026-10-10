import {moneyFact,signedCents} from './exact-money';
export type ContractJournalCategory='SERVICE_INCOME'|'SERVICE_COST'|'MISC_INCOME'|'MISC_COST'|'CAPITAL_TRANSFER'|'INTERNAL_TRANSFER'|'UNKNOWN';
export type CollateralState='offered'|'deposited'|'bound'|'returned'|'forfeited'|'lost'|'unknown';
// CCP ref-type catalogue: https://github.com/ccpgames/eve-glue/blob/master/eve_glue/wallet_journal_ref.py
// Ref type, personal ownership, contract context and actual wallet delta are separate evidence.
export function contractJournalEconomics(row:Record<string,unknown>,owner:string|undefined,own:Set<string>,contract?:Record<string,unknown>):{category:ContractJournalCategory;component:string;collateralState?:CollateralState}|null{
 const type=String(row.ref_type),delta=moneyFact(row.amount).value;
 if(type!=='insurance'&&!['contract_reward','contract_reward_deposited','contract_reward_refund','contract_collateral','contract_collateral_refund','contract_collateral_payout'].includes(type))return null;
 const unknown={category:'UNKNOWN' as const,component:type,collateralState:type.includes('collateral')?'unknown' as const:undefined};
 if(!owner||!own.has(owner)||row.is_corporation===true||delta===null||signedCents(delta)===0n)return unknown;
 const positive=signedCents(delta)>0n;
 if(type==='insurance')return {category:positive?'MISC_INCOME':'MISC_COST',component:positive?'insurance_payout':'insurance_premium'};
 if(!contract||contract.for_corporation!==false||contract.type!=='courier'||row.context_id_type!=='contract_id'||String(row.context_id)!==String(contract.contract_id))return unknown;
 const issuer=String(contract.issuer_id),acceptor=String(contract.acceptor_id),issuerOwned=own.has(issuer),acceptorOwned=own.has(acceptor),internal=issuerOwned&&acceptorOwned;
 if(owner!==issuer&&owner!==acceptor)return unknown;
 if(internal)return {category:'INTERNAL_TRANSFER',component:type};
 const runner=owner===acceptor&&acceptor!=='0',ordered=owner===issuer,finished=['finished','finished_issuer','finished_contractor'].includes(String(contract.status)),failed=contract.status==='failed';
 if(type==='contract_reward'&&finished&&((runner&&positive)||(ordered&&!positive)))return {category:positive?'SERVICE_INCOME':'SERVICE_COST',component:'courier_reward'};
 if(type==='contract_reward_deposited'&&ordered&&!positive)return {category:'CAPITAL_TRANSFER',component:'reward_escrow'};
 if(type==='contract_reward_refund'&&ordered&&positive)return {category:'CAPITAL_TRANSFER',component:'reward_refund'};
 if(type==='contract_collateral'&&runner&&!positive)return {category:'CAPITAL_TRANSFER',component:'collateral_deposit',collateralState:contract.status==='in_progress'?'bound':'deposited'};
 if(type==='contract_collateral_refund'&&runner&&positive)return {category:'CAPITAL_TRANSFER',component:'collateral_return',collateralState:'returned'};
 if(type==='contract_collateral_payout'&&failed&&((ordered&&positive)||(runner&&!positive)))return {category:positive?'MISC_INCOME':'MISC_COST',component:positive?'collateral_forfeiture':'collateral_loss',collateralState:positive?'forfeited':'lost'};
 return unknown;
}
export function courierEvidenceState(contract:Record<string,unknown>,journals:{owner:string;data:Record<string,unknown>}[],own:Set<string>){
 const components=journals.map(j=>({owner:j.owner,journalId:String(j.data.id??''),amountISK:moneyFact(j.data.amount).value,...contractJournalEconomics(j.data,j.owner,own,contract)}));
 const relevant=components.filter(c=>c.category!==undefined);
 const deposit=relevant.filter(c=>c.component==='collateral_deposit'&&c.category==='CAPITAL_TRANSFER'),returned=relevant.filter(c=>c.component==='collateral_return'&&c.category==='CAPITAL_TRANSFER');
 const sum=(rows:typeof relevant)=>rows.reduce((n,r)=>n+signedCents(r.amountISK!),0n);
 let collateralState:CollateralState='offered';
 if(relevant.some(c=>c.collateralState==='forfeited'))collateralState='forfeited';
 else if(relevant.some(c=>c.collateralState==='lost'))collateralState='lost';
 else if(returned.length)collateralState=deposit.length&&sum(deposit)+sum(returned)===0n?'returned':'unknown';
 else if(deposit.length)collateralState=contract.status==='in_progress'?'bound':['failed','cancelled','rejected','reversed'].includes(String(contract.status))?'unknown':'deposited';
 else if(relevant.some(c=>c.collateralState==='unknown')||moneyFact(contract.collateral).value===null)collateralState='unknown';
 return {offeredRewardISK:moneyFact(contract.reward).value,offeredCollateralISK:moneyFact(contract.collateral).value,collateralState,components:relevant,policy:'Amounts offered by a contract are metadata. Only actual journal evidence affects income or expenses.'};
}
