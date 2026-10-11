import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,readdirSync,unlinkSync,rmdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openDatabase,importReports,readReports} from '../src/lib/db';
import {saveBuyback,listBuybacks,linkBuybackWallet,unlinkBuybackWallet} from '../src/lib/buyback';
import type {DatabaseSync} from 'node:sqlite';
import {storeRecord} from '../src/lib/source-records';
import {reconciliation,decideReconciliation,consolidatedFinancials} from '../src/lib/reconciliation';
import {importMotorCsv} from '../src/lib/motor-import';
import {signedCents,exactSum,moneyFact} from '../src/lib/exact-money';
import {parseFinancialJson} from '../src/lib/financial-json';
import {financialFilter} from '../src/lib/financial-filter';
import {startFleet,endFleet} from '../src/lib/fleet-sessions';
const booking={weekStart:'2026-10-05',payoutDate:'2026-10-07',contractId:'99',characterId:'1001',reportingStatus:'confirmed_payout',actualPayoutISK:'450000000.01',lines:[{category:'ore_ice',actualPayoutISK:'450000000.01',janiceValueISK:'500000000',operatingCostsISK:'0'}]};
function journal(db:DatabaseSync,key='journal:1001:123',data:Record<string,unknown>={}){
 const body={id:'123',date:'2026-10-07T10:00:00Z',amount:'450000000.01',ref_type:'contract_price',context_id:'99',context_id_type:'contract_id',...data};
 storeRecord(db,{kind:'wallet_journal',source:'esi',sourceClass:'automatic',sourceCharacterId:'1001',sourceEntityId:String(body.id),sourceTimestamp:String(body.date),fetchedAt:'2026-10-08T00:00:00Z',status:'actual',dataQuality:'measured',deduplicationKey:key,data:body});
}
function isolated(name:string,run:(db:DatabaseSync)=>void){test(name,()=>{const db=openDatabase(':memory:');try{run(db);}finally{db.close();}});}
isolated('Strong contract evidence gives one buyback revenue and never repeats the 10 percent deduction',db=>{
 saveBuyback(db,booking);journal(db);const a=consolidatedFinancials(db);assert.equal(a.eventCount,1);assert.equal(a.buybackRevenueISK,'450000000.01');assert.equal(a.projectSurplusISK,'450000000.01');assert.equal(a.otherRevenueISK,null);
 assert.equal(consolidatedFinancials(db).eventCount,1);
});
isolated('Equal amount and day without identifiers are only proposals',db=>{
 const b=saveBuyback(db,booking);journal(db,'journal:1001:123',{ref_type:'player_donation',context_id:undefined,context_id_type:undefined});
 const s=reconciliation(db);assert.equal(s.proposals[0]?.status,'proposal');assert.notEqual(s.links.find(l=>l.source_key==='buyback:'+b.bookingId)?.event_id,s.links.find(l=>l.source_key==='journal:1001:123')?.event_id);assert.equal(consolidatedFinancials(db).projectSurplusISK,null);
});
isolated('Manual confirmation survives re-sync and a false link can be audited and removed',db=>{
 const b=saveBuyback(db,booking);journal(db,'journal:1001:123',{ref_type:'player_donation',context_id:undefined,context_id_type:undefined});
 decideReconciliation(db,{action:'link',left:'buyback:'+b.bookingId,right:'journal:1001:123',reason:'Verified same complete corporation payout'});
 journal(db,'journal:1001:123',{ref_type:'player_donation',context_id:undefined,context_id_type:undefined});
 assert.equal(consolidatedFinancials(db).eventCount,1);
 decideReconciliation(db,{action:'unlink',left:'journal:1001:123',reason:'Wrong payment was selected'});
 assert.equal(consolidatedFinancials(db).eventCount,2);assert.ok(reconciliation(db).proposals.some(p=>p.status==='rejected'));
 assert.equal((db.prepare("SELECT COUNT(*) n FROM reconciliation_audit WHERE action='unlink'").get() as {n:number}).n,1);
});
isolated('Rejected proposal is retained and cannot be silently automatically matched later',db=>{
 const b=saveBuyback(db,booking);journal(db,'journal:1001:123',{context_id:undefined});
 decideReconciliation(db,{action:'reject',left:'buyback:'+b.bookingId,right:'journal:1001:123',reason:'Different goods'});
 journal(db);assert.ok(reconciliation(db).proposals.some(p=>p.status==='rejected'));assert.equal(consolidatedFinancials(db).eventCount,2);
});
isolated('Both own-wallet transfer sides create no income',db=>{
 for(const id of ['1001','1002'])db.prepare('INSERT INTO characters VALUES (?,?,?,?,?,?,?,?,?)').run(id,'Fixture '+id,'[]','fixture','connected','g','2026-10-01T00:00:00Z',null,null);
 journal(db,'transfer:debit',{ref_type:'player_donation',context_id:undefined,first_party_id:'1001',second_party_id:'1002',amount:'-1000000000',id:'501'});
 storeRecord(db,{kind:'wallet_journal',source:'esi',sourceClass:'automatic',sourceCharacterId:'1002',sourceEntityId:'501',sourceTimestamp:'2026-10-07T10:00:00Z',fetchedAt:'2026-10-08T00:00:00Z',status:'actual',dataQuality:'measured',deduplicationKey:'transfer:credit',data:{id:'501',ref_type:'player_donation',date:'2026-10-07T10:00:00Z',first_party_id:'1001',second_party_id:'1002',amount:'1000000000'}});
 const a=consolidatedFinancials(db);assert.equal(a.buybackRevenueISK,null);assert.equal(a.otherRevenueISK,null);assert.equal(a.events.filter(e=>e.category==='INTERNAL_TRANSFER').length,1);
});
isolated('Trading CSV and ESI share the int64 transaction identity and one cost-based profit',db=>{
 const header='source_id,character_id,source_transaction_id,timestamp,type_id,side,quantity,unit_price_isk,cost_basis_isk,cost_basis_reference,broker_fees_isk,sales_tax_isk,relist_costs_isk,operating_costs_isk,goods_origin,status';
 const csv=header+'\nrow1,1001,9223372036854775807,2026-10-07T10:00:00Z,34,sell,10,100.01,600,invoice-1,10,20,0,0,purchased,actual';
 importMotorCsv(db,csv,'fixture.csv');importMotorCsv(db,csv,'again.csv');
 storeRecord(db,{kind:'wallet_transaction',source:'esi',sourceClass:'automatic',sourceCharacterId:'1001',sourceEntityId:'9223372036854775807',fetchedAt:'2026-10-08T00:00:00Z',status:'actual',dataQuality:'measured',deduplicationKey:'esi:1001:wallet_transaction:9223372036854775807',data:{transaction_id:'9223372036854775807',journal_ref_id:'555',date:'2026-10-07T10:00:00Z',quantity:10,unit_price:'100.01',is_buy:false,type_id:'34'}});
 const a=consolidatedFinancials(db);assert.equal(a.eventCount,1);assert.equal(a.tradingNetISK,'370.10');
});
isolated('Unknown purchase basis does not establish verified trading profit',db=>{
 storeRecord(db,{kind:'wallet_transaction',source:'esi',sourceClass:'automatic',sourceCharacterId:'1001',sourceEntityId:'1',fetchedAt:'2026-10-08T00:00:00Z',status:'actual',dataQuality:'measured',deduplicationKey:'transaction:1',data:{transaction_id:'1',date:'2026-10-07T10:00:00Z',quantity:10,unit_price:'100.01',is_buy:false}});
 assert.equal(consolidatedFinancials(db).tradingNetISK,null);assert.equal(consolidatedFinancials(db).projectSurplusISK,null);
});
isolated('Mining and PI production with a later buyback are not cash income twice',db=>{
 saveBuyback(db,booking);
 for(const kind of ['mining_entry','pi_colony'])storeRecord(db,{kind,source:'esi',sourceClass:'automatic',sourceEntityId:kind,fetchedAt:'2026-10-08T00:00:00Z',sourceTimestamp:'2026-10-07T10:00:00Z',status:'actual',dataQuality:'measured',deduplicationKey:kind,data:{quantity:999999,type_id:'34'}});
 const a=consolidatedFinancials(db);assert.equal(a.buybackRevenueISK,'450000000.01');assert.equal(a.eventCount,1);
});
isolated('Janice estimates and wallet snapshots do not create realized income',db=>{
 saveBuyback(db,{...booking,reportingStatus:'valuation',actualPayoutISK:null,lines:[{category:'ore_ice',actualPayoutISK:null,janiceValueISK:'500000000'}]});
 storeRecord(db,{kind:'wallet_balance',source:'esi',sourceClass:'automatic',sourceCharacterId:'1001',fetchedAt:'2026-10-08T00:00:00Z',status:'actual',dataQuality:'measured',deduplicationKey:'balance:1001',data:{wallet:'99999999999'}});
 assert.equal(consolidatedFinancials(db).eventCount,0);
});
isolated('Project-start boundary does not invent a payout date for weekly history',db=>{
 saveBuyback(db,{...booking,weekStart:'2026-09-28',payoutDate:null});
 assert.equal(consolidatedFinancials(db).buybackRevenueISK,null);
 const b=listBuybacks(db)[0];saveBuyback(db,{...booking,weekStart:'2026-09-28',payoutDate:'2026-10-04',bookingId:b.bookingId,expectedRevision:b.revision});
 assert.equal(consolidatedFinancials(db).buybackRevenueISK,'450000000.01');
});
isolated('Missing production costs remain unknown instead of zero',db=>{
 saveBuyback(db,{...booking,lines:[{category:'ore_ice',actualPayoutISK:'450000000.01'}]});
 assert.equal(consolidatedFinancials(db).projectSurplusISK,null);
});
isolated('Agent report and buyback are reconciled only after whole-event confirmation',db=>{
 const b=saveBuyback(db,booking),raw=JSON.parse(readFileSync('examples/MiningDailyReport.json','utf8'));
 raw.period={from:'2026-10-07T00:00:00Z',to:'2026-10-07T23:59:59Z'};raw.generatedAt='2026-10-08T00:00:00Z';raw.data.realizedRevenue=450000000.01;raw.data.operatingCosts=0;raw.evidenceReferences=['buyback:'+b.bookingId];
 importReports(db,raw,'agent.json');assert.equal(consolidatedFinancials(db).projectSurplusISK,null);
 decideReconciliation(db,{action:'link',left:'report:'+raw.reportId,right:'buyback:'+b.bookingId,reason:'Single complete payout, no additional payments in daily report'});
 const a=consolidatedFinancials(db);assert.equal(a.eventCount,1);assert.equal(a.buybackRevenueISK,'450000000.01');
});
isolated('Classification corrections require optimistic revision and preserve raw source',db=>{
 journal(db,'journal:1001:123',{ref_type:'player_donation',context_id:undefined});
 const s=reconciliation(db),event=s.events.find(e=>e.event_id===s.links[0].event_id)!;
 decideReconciliation(db,{action:'classify',left:'journal:1001:123',category:'PLEX_PURCHASE',expectedRevision:event.revision,reason:'Verified asset conversion'});
 assert.equal(consolidatedFinancials(db).otherRevenueISK,null);
 assert.throws(()=>decideReconciliation(db,{action:'classify',left:'journal:1001:123',category:'OTHER_INCOME',expectedRevision:event.revision,reason:'Stale edit'}),/Reload/);
 assert.equal(reconciliation(db).sources[0].raw instanceof Object,true);
});
test('Exact cents support large values without unsafe number conversion',()=>{
 assert.equal(exactSum(['90071992547409.91','0.02']),'90071992547409.93');assert.equal(signedCents('-0.01'),-1n);
 assert.equal(moneyFact(90071992547409.91).quality,'precision_unknown');
 assert.equal(moneyFact('0.001').value,null);
});
isolated('Decimal JSON imports preserve large cents and serialize exact money as strings',db=>{
 const text=readFileSync('examples/MiningDailyReport.json','utf8').replace('"realizedRevenue": "not_reported"','"realizedRevenue": 90071992547409.91').replace('"operatingCosts": "not_reported"','"operatingCosts": 0');
 const parsed=parseFinancialJson(text);importReports(db,parsed,'precise.json');const a=consolidatedFinancials(db);
 assert.equal(a.events[0].amountISK,'90071992547409.91');assert.equal(typeof a.events[0].amountISK,'string');assert.equal(readReports(db).length,1);
});
test('File database concurrent revisions reject stale booking edits; fleet starts serialize',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'eve-concurrency-')),filename=path.join(dir,'test.sqlite'),a=openDatabase(filename),b=openDatabase(filename);
 try{const saved=saveBuyback(a,booking);saveBuyback(a,{...booking,bookingId:saved.bookingId,expectedRevision:1,notes:'First'});
 assert.throws(()=>saveBuyback(b,{...booking,bookingId:saved.bookingId,expectedRevision:1,notes:'Lost update'}),/Reload/);
 assert.equal(listBuybacks(b)[0].notes,'First');
 const now=new Date('2026-10-07T11:00:00Z'),input={characters:[{name:'Fixture'}],startedAt:'2026-10-07T10:00:00Z'};
 const fleet=startFleet(a,input,now);assert.throws(()=>startFleet(b,input,now),/already/);
 const ended=endFleet(a,fleet.sessionId,now.toISOString(),now);assert.equal(endFleet(b,fleet.sessionId,'2026-10-07T10:30:00Z',now).endedAt,ended.endedAt);
 }finally{a.close();b.close();for(const name of readdirSync(dir))unlinkSync(path.join(dir,name));rmdirSync(dir);}
});
test('Schema-v4 migration creates a backup and preserves raw reports and uncertain legacy precision',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'eve-v5-')),filename=path.join(dir,'test.sqlite'),initial=openDatabase(filename);
 initial.exec('DROP TABLE contract_item_origins; DROP TABLE inventory_positions; DROP TABLE inventory_observations; DROP TABLE inventory_audit; DROP TABLE inventory_rules; DROP TABLE inventory_transformations; DROP TABLE inventory_evidence_claims; DROP TABLE inventory_rejections; DROP TABLE inventory_state; DROP TABLE contract_observations; DROP TABLE contract_decisions; DROP TABLE evidence_allocations; DROP TABLE event_cost_components; DROP TABLE sde_imports; DROP INDEX manual_session_active; DROP TABLE financial_money; DROP TABLE reconciliation_audit; DROP TABLE reconciliation_decisions; DROP TABLE event_sources; DROP TABLE economic_events; DROP TABLE financial_sources; DROP TABLE inventory_origin_movements; DROP TABLE inventory_origin_lots; DROP TABLE economic_source_observations; DROP TABLE economic_baseline_audit; DROP TABLE economic_baselines; PRAGMA user_version=4');
 const report=readFileSync('seed/01-coordinator.json','utf8');initial.prepare('INSERT INTO reports VALUES (?,?,?,?,?)').run('legacy','legacy',report,'2026-10-08T00:00:00Z','seed.json');initial.close();
 const db=openDatabase(filename);try{assert.equal((db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version,9);assert.equal((db.prepare('SELECT body FROM reports').get() as {body:string}).body,report);assert.ok(readdirSync(dir).some(n=>n.includes('.pre-v5-')&&existsSync(path.join(dir,n))));}finally{db.close();for(const n of readdirSync(dir))unlinkSync(path.join(dir,n));rmdirSync(dir);}
});
isolated('Shared financial filter produces the same UI/API scope; production outside scope stays excluded',db=>{
 saveBuyback(db,booking);const filter=financialFilter({from:'2026-10-07',to:'2026-10-07',characterId:'1001',source:'buyback'});
 assert.equal(consolidatedFinancials(db,filter).eventCount,1);assert.equal(consolidatedFinancials(db,filter).buybackRevenueISK,'450000000.01');
 assert.equal(consolidatedFinancials(db,{from:'2026-10-08',to:'2026-10-08'}).buybackRevenueISK,null);
});
isolated('Changed strong identity with conflicting amount stays a conflict',db=>{
 saveBuyback(db,booking);journal(db,'journal:1001:123',{amount:'450000000.02'});
 assert.equal(reconciliation(db).proposals[0]?.status,'conflict');assert.equal(consolidatedFinancials(db).projectSurplusISK,null);
});

isolated('Market journal_ref_id ties a cash mirror to its trading transaction exactly once',db=>{
 journal(db,'journal:1001:555',{id:'555',ref_type:'market_transaction',amount:'1000.10',context_id:undefined});
 storeRecord(db,{kind:'wallet_transaction',source:'esi',sourceClass:'automatic',sourceCharacterId:'1001',sourceEntityId:'tx1',fetchedAt:'2026-10-08T00:00:00Z',status:'actual',dataQuality:'measured',deduplicationKey:'tx:1',data:{transaction_id:'1',journal_ref_id:'555',date:'2026-10-07T10:00:00Z',quantity:10,unit_price:'100.01',is_buy:false}});
 const a=consolidatedFinancials(db);assert.equal(a.eventCount,1);assert.equal(a.tradingNetISK,null);
});
isolated('Reconciled payouts cannot be edited without explicitly removing the evidence link',db=>{
 const b=saveBuyback(db,booking);journal(db);reconciliation(db);
 assert.throws(()=>saveBuyback(db,{...booking,bookingId:b.bookingId,expectedRevision:b.revision,notes:'Unsafe edit'}),/Reconciled payout/);
});
isolated('Conflicting re-sync preserves the old manual link and suppresses verified aggregates',db=>{
 const b=saveBuyback(db,booking);journal(db,'journal:1001:123',{context_id:undefined,ref_type:'player_donation'});
 decideReconciliation(db,{action:'link',left:'buyback:'+b.bookingId,right:'journal:1001:123',reason:'Verified corporation payout'});
 journal(db,'journal:1001:123',{amount:'1.00',context_id:undefined,ref_type:'player_donation'});
 assert.equal(reconciliation(db).links.filter(l=>l.event_id===reconciliation(db).links[0].event_id).length,2);
 assert.equal(consolidatedFinancials(db).buybackRevenueISK,null);assert.equal(consolidatedFinancials(db).projectSurplusISK,null);
});

isolated('Same contract with multiple payments is ambiguous, not an automatic collapse',db=>{
 saveBuyback(db,booking);journal(db);
 journal(db,'journal:1001:124',{id:'124'});
 const state=reconciliation(db);assert.ok(state.proposals.some(p=>p.reason.includes('multiple payments')));
 assert.equal(consolidatedFinancials(db).eventCount,3);assert.equal(consolidatedFinancials(db).projectSurplusISK,null);
});
isolated('Production, plan and rejected empty monetary values never introduce a zero-cost claim',db=>{
 const raw=JSON.parse(readFileSync('examples/MiningDailyReport.json','utf8'));
 raw.status='estimate';raw.data.realizedRevenue=100;raw.data.operatingCosts=0;
 importReports(db,raw,'estimate.json');assert.equal(consolidatedFinancials(db).eventCount,0);
});

isolated('Legacy wallet unlink also detaches its financial event and remains rejected',db=>{
 const b=saveBuyback(db,booking);journal(db);
 linkBuybackWallet(db,b.bookingId,'journal:1001:123');assert.equal(consolidatedFinancials(db).eventCount,1);
 unlinkBuybackWallet(db,b.bookingId);assert.equal(consolidatedFinancials(db).eventCount,2);assert.equal(listBuybacks(db)[0].reconciliationStatus,'unmatched');
});
isolated('New reconciliation unlink also clears the legacy wallet bridge with audit',db=>{
 const b=saveBuyback(db,booking);journal(db);linkBuybackWallet(db,b.bookingId,'journal:1001:123');reconciliation(db);
 decideReconciliation(db,{action:'unlink',left:'journal:1001:123',reason:'Reviewed wrong wallet payment'});
 assert.equal((db.prepare('SELECT COUNT(*) n FROM buyback_wallet_links').get() as {n:number}).n,0);
 assert.equal(listBuybacks(db)[0].reconciliationStatus,'unmatched');
 assert.equal(consolidatedFinancials(db).eventCount,2);
});

test('Numeric JSON exponent and insignificant zeros preserve exact cent compatibility',()=>{
 assert.equal(moneyFact('1.2300e2').value,'123.00');
 assert.equal(moneyFact('0.0100').value,'0.01');
 assert.equal(moneyFact('0.001').value,null);
 assert.equal((parseFinancialJson('{"realizedRevenue":1e10,"operatingCosts":0.0100}') as {realizedRevenue:string}).realizedRevenue,'10000000000');
});
