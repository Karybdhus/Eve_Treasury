import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {validateReport} from '../src/lib/contracts';
import {difference,funding,profit,sum,weekly} from '../src/lib/accounting';
import {importReports,openDatabase,readReports} from '../src/lib/db';
const envelope={schemaVersion:'1.0',reportId:'aaaaaaaa-0000-4000-8000-000000000001',pillar:'trading',reportType:'daily',period:{from:'2026-10-05T00:00:00Z',to:'2026-10-05T23:59:59Z'},generatedAt:'2026-10-06T00:00:00Z',source:'manual',status:'actual',currency:'ISK',provenance:'live'};
const daily={...envelope,data:{kind:'TradingDailyReport',realizedRevenue:1000,operatingCosts:20,costOfGoodsSold:600,brokerFees:10,salesTax:30,relistCosts:5,legacyLiquidationRevenue:2000,legacyLiquidationCostBasis:1500,legacyLiquidationFees:50,averageCapitalEmployed:2000,internalTransfers:100000,plexPurchases:1000000}};
test('Accounting excludes transfers, PLEX purchases and legacy sales from new profit',()=>assert.equal(profit(validateReport(daily)),335));
test('Plan and estimate values never become actual profit',()=>{for(const status of ['plan','estimate'])assert.equal(profit(validateReport({...daily,status})),'not_reported');});
test('Unknown is preserved, zero is known, cent arithmetic is exact',()=>{assert.equal(sum([0,0]),0);assert.equal(sum([]),'not_reported');assert.equal(sum([2,'unknown']),'unknown');assert.equal(difference(10,['not_reported']),'not_reported');assert.equal(difference(0.3,[0.1,0.2]),0);});
test('Wallet alone is not released PLEX budget',()=>{const trading=validateReport(JSON.parse(readFileSync('seed/02-trading.json','utf8')));const coordinator=validateReport(JSON.parse(readFileSync('seed/01-coordinator.json','utf8')));assert.equal(funding([trading,coordinator],new Date('2026-10-08T00:00:00Z')).equivalent,'not_reported');});
test('Coordinator uses physical PLEX plus explicitly released funds, not total wallet',()=>{const raw=JSON.parse(readFileSync('seed/01-coordinator.json','utf8'));raw.provenance='live';raw.data={physicalPlex:260,freeLiquidity:1000000000,releasedPlexContribution:500000000,plexUnitPrice:5000000,priceEvidence:{source:'manual',fetchedAt:'2026-10-08T09:00:00Z',quality:'actual'},kind:'CoordinatorSnapshot'};assert.equal(funding([validateReport(raw)],new Date('2026-10-08T10:00:00Z')).equivalent,360);raw.data.releasedPlexContribution=2000000000;assert.throws(()=>validateReport(raw),/cannot exceed/);});
test('Duplicate imports are idempotent; conflicting IDs and overlapping days rejected',()=>{const db=openDatabase(':memory:');try{assert.equal(importReports(db,daily,'test.json').imported,1);assert.equal(importReports(db,daily,'test.json').skipped,1);assert.throws(()=>importReports(db,{...daily,notes:'changed'},'test.json'),/immutable/);assert.throws(()=>importReports(db,{...daily,reportId:'aaaaaaaa-0000-4000-8000-000000000002'},'test.json'),/Overlapping/);assert.equal(readReports(db).length,1);}finally{db.close();}});
test('An import batch rolls back completely after a conflict',()=>{const db=openDatabase(':memory:');try{assert.throws(()=>importReports(db,[daily,{...daily,reportId:'aaaaaaaa-0000-4000-8000-000000000002'}],'test.json'));assert.equal(readReports(db).length,0);}finally{db.close();}});
test('Partial weekly data never looks like a complete total',()=>{const rows=weekly([validateReport(daily)],new Date('2026-10-08T12:00:00Z'));const week=rows.find(w=>w.week==='2026-10-05');assert.equal(week?.knownSubtotal,335);assert.equal(week?.total,'not_reported');assert.equal(week?.trading,'not_reported');});
test('Session revenue does not double count daily aggregates',()=>{const session=JSON.parse(readFileSync('seed/03-mining.json','utf8'));session.data.realizedRevenue=10000;session.data.operatingCosts=0;const rows=weekly([validateReport(session),validateReport(daily)],new Date('2026-10-08T12:00:00Z'));assert.equal(rows.find(w=>w.week==='2026-10-05')?.knownSubtotal,335);});
test('Full-day coverage, impossible periods and unrecognized fields are rejected',()=>{assert.throws(()=>validateReport({...daily,period:{from:'2026-10-05T12:00:00Z',to:'2026-10-05T23:59:59Z'}}),/full UTC day/);assert.throws(()=>validateReport({...daily,period:{from:'2026-10-06T00:00:00Z',to:'2026-10-05T23:59:59Z'}}));assert.throws(()=>validateReport({...daily,typo:true}),/Unrecognized/);});
test('Industry planning does not generate actual income',()=>{const raw=JSON.parse(readFileSync('seed/04-industry.json','utf8'));raw.status='actual';raw.data.realizedRevenue=100;assert.throws(()=>validateReport(raw),/cannot report actual revenue/);raw.status='plan';assert.equal(profit(validateReport(raw)),'not_reported');});

test('Every example validates against its own typed contract',()=>{
  for(const file of readdirSync('examples').filter(n=>n.endsWith('.json')))validateReport(JSON.parse(readFileSync('examples/'+file,'utf8')));
});
test('Imported reports survive closing and reopening a disk database',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'eve-dashboard-test-'));
  const file=path.join(dir,'test.sqlite');
  let db=openDatabase(file);
  try {
    importReports(db,daily,'persistent.json');db.close();db=openDatabase(file);
    assert.equal(readReports(db).length,1);
    assert.equal(profit(readReports(db)[0].report),335);
  } finally {
    db.close();
    for(const name of readdirSync(dir))unlinkSync(path.join(dir,name));
    rmdirSync(dir);
  }
});
test('A complete zero-profit project week is known zero, supplementary stays separate',()=>{
  const rows=['MiningDailyReport','PiDailyReport','TradingDailyReport','IndustryStatusReport'].map((name,i)=>{
    const raw=JSON.parse(readFileSync('examples/'+name+'.json','utf8'));
    raw.reportId='cccccccc-0000-4000-8000-'+String(i+1).padStart(12,'0');
    raw.period={from:'2026-10-04T00:00:00Z',to:'2026-10-04T23:59:59Z'};
    raw.generatedAt='2026-10-05T00:00:00Z';raw.reportType='daily';raw.status='actual';raw.provenance='live';
    for(const key of Object.keys(raw.data))if(raw.data[key]==='not_reported')raw.data[key]=0;
    return validateReport(raw);
  });
  const week=weekly(rows,new Date('2026-10-04T21:59:59Z'))[0];
  assert.equal(week.total,0);assert.equal(week.complete,true);assert.equal(week.supplementary,'not_reported');
});
test('Future planning period can be generated before its observation date',()=>{
  const raw=JSON.parse(readFileSync('seed/04-industry.json','utf8'));
  raw.period={from:'2030-01-01T00:00:00Z',to:'2030-01-01T00:00:00Z'};
  assert.equal(validateReport(raw).status,'plan');
});
