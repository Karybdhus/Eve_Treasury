import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureDb,archive,item,confirm,now} from './followup-fixtures';
import {contractManagement,decideContractManagement} from '../src/lib/contract-management';
import {contractArchive} from '../src/lib/esi-contracts';
import {originEconomicCategory,legacyEconomicCategory,economicCategories} from '../src/lib/economic-categories';
test('General contracts distinguish own roles and included/requested item flow without reading price sign',()=>{const db=fixtureDb();try{
 archive(db);let c=contractManagement(db,'99');assert.equal(c.role,'issuer');assert.equal(c.direction,'outgoing');assert.equal(c.purpose,'material_sale');
 archive(db,{contract_id:'100',issuer_id:'9001',acceptor_id:'1001',assignee_id:'1001',price:'-500'});c=contractManagement(db,'100');assert.equal(c.direction,'incoming');assert.equal(c.purpose,'material_purchase');
 archive(db,{contract_id:'101'},[item({is_included:false})]);assert.equal(contractManagement(db,'101').direction,'incoming');
 archive(db,{contract_id:'102'},[item(),item({record_id:'2',is_included:false})]);assert.equal(contractManagement(db,'102').direction,'exchange');assert.equal(contractManagement(db,'102').purpose,'unknown');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM economic_events').get()!.n,0);
 }finally{db.close();}});
test('Own transfers, corporate contracts and unsupported ESI types cannot imply external income',()=>{const db=fixtureDb();try{
 archive(db,{acceptor_id:'1002',assignee_id:'1002'});assert.equal(contractManagement(db,'99').direction,'internal');
 assert.throws(()=>decideContractManagement(db,{contractId:'99',revision:0,action:'confirm',purpose:'material_sale',direction:'outgoing',reason:'Invalid own transfer'}),/internal/);
 archive(db,{contract_id:'100',for_corporation:true});assert.equal(contractManagement(db,'100').role,'unknown');
 assert.throws(()=>decideContractManagement(db,{contractId:'100',revision:0,action:'confirm',purpose:'material_sale',direction:'outgoing',reason:'No personal ownership'}),/ownership/);
 archive(db,{contract_id:'101',type:'future_esi_type'});assert.equal(contractManagement(db,'101').direction,'unknown');assert.equal(contractArchive(db).length,3);
 }finally{db.close();}});
test('Manual decisions are revisioned, audited, revocable and survive status changes and observer deduplication',()=>{const db=fixtureDb();try{
 archive(db);confirm(db);let c=decideContractManagement(db,{contractId:'99',revision:1,action:'confirm',purpose:'material_sale',direction:'outgoing',reason:'Own outgoing material verified'});assert.equal(c.reviewed,true);assert.equal(c.legacyPurpose,null);
 assert.equal(db.prepare('SELECT category FROM contract_decisions').get()!.category,'ore_ice');
 assert.throws(()=>decideContractManagement(db,{contractId:'99',revision:1,action:'revoke',reason:'Stale writer'}),/Revision conflict/);
 archive(db,{status:'finished_contractor'},[item()],'1002','2026-10-09T00:00:00Z');c=contractManagement(db,'99');assert.equal(c.reviewed,true);assert.equal(c.revision,2);assert.equal(contractArchive(db).length,1);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM contract_observations').get()!.n,2);
 archive(db,{acceptor_id:'1002'},[item()],'1001','2026-10-09T01:00:00Z');c=contractManagement(db,'99');assert.equal(c.quality,'conflict');assert.equal(c.reviewed,false);
 c=decideContractManagement(db,{contractId:'99',revision:2,action:'revoke',reason:'Changed counterparty requires review'});assert.equal(c.decisionActive,false);assert.equal(c.direction,'internal');
 assert.equal(db.prepare("SELECT COUNT(*) n FROM reconciliation_audit WHERE action LIKE 'contract_management_%'").get()!.n,2);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM financial_sources').get()!.n,0);
 }finally{db.close();}});
test('Courier role is determined from personal issuer/acceptor, never from assumed reward payment',()=>{const db=fixtureDb();try{
 archive(db,{type:'courier',reward:'300',collateral:'1000'});assert.equal(contractManagement(db,'99').purpose,'transport_order');
 assert.throws(()=>decideContractManagement(db,{contractId:'99',revision:0,action:'confirm',purpose:'transport_service',direction:'courier_runner',reason:'Wrong role'}),/Courier direction/);
 archive(db,{contract_id:'100',type:'courier',issuer_id:'9001',acceptor_id:'1001',assignee_id:'1001'});assert.equal(contractManagement(db,'100').direction,'courier_runner');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM economic_events').get()!.n,0);
 }finally{db.close();}});
test('Canonical economics preserves legacy origin distinctions and never promotes unknown to MISC',()=>{
 assert.equal(economicCategories.length,9);for(const origin of ['Mining','Ice','MINING_ICE','ore_ice'])assert.equal(originEconomicCategory(origin),'MINING');
 assert.equal(originEconomicCategory('Salvage'),'SALVAGE');assert.equal(originEconomicCategory('Hacking'),'HACKING');assert.equal(originEconomicCategory('Trading'),'TRADEPROFIT');
 assert.equal(legacyEconomicCategory('BUYBACK_RATLOOT'),'LOOT');assert.equal(legacyEconomicCategory('ESS_INCOME'),'RATTING');assert.equal(legacyEconomicCategory('UNKNOWN'),null);assert.equal(legacyEconomicCategory('OTHER_INCOME'),null);assert.equal(originEconomicCategory('unknown'),null);
});
test('Older imports cannot erase general decisions or latest archive',()=>{const db=fixtureDb();try{archive(db);decideContractManagement(db,{contractId:'99',revision:0,action:'confirm',purpose:'material_sale',direction:'outgoing',reason:'Persistent role'});archive(db,{type:'courier'},null,'1002','2026-10-07T00:00:00Z');assert.equal(contractManagement(db,'99').reviewed,true);assert.equal(contractManagement(db,'99').fetchedAt,now);}finally{db.close();}});
