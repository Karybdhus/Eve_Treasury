import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureDb,archive,confirm,payment,item} from './followup-fixtures';
import {contractArchive,confirmContract} from '../src/lib/esi-contracts';
import {consolidatedFinancials} from '../src/lib/reconciliation';
import {contractPaymentEvidence,confirmFullContractPayment} from '../src/lib/contract-payments';
import {realizedStatistics,walletLiquidity,buybackPeriods} from '../src/lib/dashboard-statistics';
import {openDatabase} from '../src/lib/db';
import {startFleet,endFleet,fleetAnalytics} from '../src/lib/fleet-sessions';
import {saveEssObservation} from '../src/lib/ess-observations';
test('Acceptance: whole contract wallet evidence stays single and repeat confirmation is idempotent',()=>{
 const db=fixtureDb();try{archive(db);confirm(db);const key=payment(db,'whole','500');const before=consolidatedFinancials(db);assert.equal(before.buybackRevenueISK,null);
 confirmFullContractPayment(db,{contractId:'99',paymentKey:key,reason:'Confirmed full contract credit',expectedRevision:1});
 confirmFullContractPayment(db,{contractId:'99',paymentKey:key,reason:'Repeat',expectedRevision:1});
 const after=consolidatedFinancials(db);assert.equal(after.buybackRevenueISK,'500.00');assert.equal(after.events.filter(e=>e.category.startsWith('BUYBACK_')).length,1);assert.equal(contractPaymentEvidence(db)[0].paid,true);assert.equal(buybackPeriods(after,'month')[0].category,'MINING_ICE');
 }finally{db.close();}
});
test('Acceptance: open contract and negative wallet amount cannot create Buyback revenue',()=>{
 const db=fixtureDb();try{archive(db,{status:'outstanding'});confirm(db);const p=payment(db,'open','500');assert.equal(consolidatedFinancials(db).buybackRevenueISK,null);assert.throws(()=>confirmFullContractPayment(db,{contractId:'99',paymentKey:p,reason:'Invalid open payout',expectedRevision:1}),/Completed/);
 archive(db,{},[item()],'1001','2026-10-08T01:00:00Z');payment(db,'open','-500');assert.equal(contractPaymentEvidence(db)[0].payments.length,0);assert.equal(consolidatedFinancials(db).buybackRevenueISK,null);
 }finally{db.close();}
});
test('Acceptance: purpose is independent, audited, persistent and Courier never becomes Buyback',()=>{
 const db=fixtureDb();try{archive(db,{type:'courier'});confirmContract(db,{contractId:'99',category:'ore_ice',purpose:'courier',reason:'Courier archive only',expectedPayoutISK:null,expectedRevision:0});payment(db,'1','500');assert.equal(contractArchive(db)[0].purpose,'courier');assert.equal(consolidatedFinancials(db).buybackRevenueISK,null);archive(db,{type:'courier'},[], '1001','2026-10-08T01:00:00Z');assert.equal(contractArchive(db)[0].purpose,'courier');assert.equal(contractArchive(db)[0].revision,1);assert.ok(db.prepare("SELECT count(*) AS n FROM reconciliation_audit WHERE action='contract_classification'").get()!.n);
 }finally{db.close();}
});
test('Acceptance: mixed contracts remain unallocated and manual decisions survive new observations',()=>{
 const db=fixtureDb();try{archive(db,{},[item(),item({record_id:'2',type_id:'999'})]);assert.equal(contractArchive(db)[0].category,null);assert.equal(contractArchive(db)[0].mixed,true);confirmContract(db,{contractId:'99',category:'salvage',purpose:'buyback',reason:'Whole basket provenance, no arbitrary split',expectedPayoutISK:'500',expectedRevision:0});archive(db,{},[item()],'1001','2026-10-08T01:00:00Z');assert.equal(contractArchive(db)[0].category,'salvage');assert.equal(contractArchive(db)[0].purpose,'buyback');assert.equal(contractArchive(db)[0].quality,'MANUALLY_CONFIRMED');
 }finally{db.close();}
});
test('Acceptance: Bounties combines paid NPC and ESS once; observations produce no expense or income',()=>{
 const db=fixtureDb();try{payment(db,'b','90',{ref_type:'bounty_prizes',context_id:undefined});payment(db,'e','20',{ref_type:'ess_escrow_transfer',context_id_type:'system_id',context_id:'30000142'});saveEssObservation(db,{characterId:'1001',kind:'stolen_potential',observedAt:'2026-10-07T12:00:00Z',amountISK:'1000',typeId:null,quantity:null,reason:'Observed potential only'});const s=consolidatedFinancials(db),p=realizedStatistics(s);assert.equal(p.bountiesISK,'110.00');assert.equal(p.otherRevenueISK,null);assert.equal(p.grossRevenueISK,'110.00');assert.equal(p.costs.length,0);assert.equal(s.projectSurplusISK,'110.00');
 }finally{db.close();}
});
test('Acceptance: offline roster starts, remains visible, ends and computes character hours without ESI',()=>{
 const db=openDatabase(':memory:');try{const t=new Date('2026-10-07T10:00:00Z'),s=startFleet(db,{characters:[{name:'Offline A'},{name:'Offline B'}]},t);assert.equal(fleetAnalytics(db)[0].sessionId,s.sessionId);assert.equal(fleetAnalytics(db)[0].endedAt,null);assert.throws(()=>startFleet(db,{characters:[{name:'Offline A'}]},t),/already/);const done=endFleet(db,s.sessionId,'2026-10-07T11:30:00Z',new Date('2026-10-07T12:00:00Z'));assert.equal(done.fleetHours,1.5);assert.equal(done.characterHours,3);assert.equal(fleetAnalytics(db)[0].revenueISK,null);
 }finally{db.close();}
});
test('Acceptance: large wallet decimal values are summed exactly without pretending missing wallets are zero',()=>{
 const base={kind:'wallet_balance',source:'esi',sourceClass:'automatic',status:'actual',dataQuality:'measured',fetchedAt:'2026-10-07T00:00:00Z'} as const;
 const rows=[{...base,sourceCharacterId:'1',deduplicationKey:'wallet:1',data:{wallet:'90071992547409.91'}},{...base,sourceCharacterId:'2',deduplicationKey:'wallet:2',data:{wallet:'0.01'}}];
 assert.equal(walletLiquidity(rows).amountISK,'90071992547409.92');assert.equal(walletLiquidity([...rows,{...base,sourceCharacterId:'3',deduplicationKey:'wallet:3',data:{wallet:null}}]).amountISK,null);assert.equal(walletLiquidity([]).amountISK,null);
});


test('Acceptance: unrelated open contract cannot block completed Buyback evidence',()=>{
 const db=fixtureDb();try{archive(db);confirm(db);const key=payment(db,'1','500');confirmFullContractPayment(db,{contractId:'99',paymentKey:key,reason:'Explicit historical payment allocation',expectedRevision:1});archive(db,{contract_id:'100',status:'outstanding'});const s=consolidatedFinancials(db);assert.equal(s.buybackRevenueISK,'500.00');assert.equal(s.unresolved,0);
 }finally{db.close();}
});
test('Acceptance: whole payment workflow refuses partial matching without constructing remainder fields',()=>{
 const db=fixtureDb();try{archive(db);confirm(db);const p=payment(db,'1','200');assert.throws(()=>confirmFullContractPayment(db,{contractId:'99',paymentKey:p,reason:'Whole contract evidence',expectedRevision:1}),/full payout/);assert.equal(db.prepare('SELECT count(*) AS n FROM evidence_allocations').get()!.n,0);
 }finally{db.close();}
});
test('Acceptance: self-earned direct sales are other gross revenue, not verified trading profit',()=>{
 const db=fixtureDb();try{db.prepare('INSERT INTO project_records VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run('motor:direct','motor_trade','motor_market','manual','1001','direct','2026-10-08T00:00:00Z','2026-10-07T00:00:00Z','measured','actual',JSON.stringify({side:'sell',gross_isk:'123.45',goods_origin:'self_earned',timestamp:'2026-10-07T00:00:00Z',quantity:1}),null,1);const s=consolidatedFinancials(db);assert.equal(s.tradingNetISK,null);assert.equal(realizedStatistics(s).otherRevenueISK,'123.45');assert.equal(s.projectSurplusISK,null);
 }finally{db.close();}
});
