import {readFileSync} from 'node:fs';
import {validateReport} from '../src/lib/contracts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildInsights} from '../src/lib/insights';
import {industryAnalysis} from '../src/lib/industry-analysis';
import type {ProjectRecord} from '../src/lib/source-records';
const row=(kind:string,data:Record<string,unknown>,sourceTimestamp='2026-10-01T00:00:00Z'):ProjectRecord=>({kind,source:'esi',sourceClass:'automatic',sourceCharacterId:'1001',sourceEntityId:'1',deduplicationKey:kind+':1',fetchedAt:'2026-10-08T00:00:00Z',sourceTimestamp,dataQuality:'measured',status:'actual',data});
test('Insights are evidence-bearing rules; stale PI and queue forecasts do not invent ISK',()=>{const rows=[row('pi_colony',{}),row('pi_pin',{expiry_time:'2026-10-08T18:00:00Z'}),row('skill_queue',{queue:[{skill_id:'2495',queue_position:0,finished_level:4,start_date:'2026-10-07T00:00:00Z',finish_date:'2026-10-09T00:00:00Z'}]},'2026-10-08T00:00:00Z')],out=buildInsights([],rows,[],new Date('2026-10-08T10:00:00Z'));assert.ok(out.some(i=>i.id==='plex-price'));assert.ok(out.some(i=>i.id.startsWith('pi-stale')&&i.quality==='STALE'));assert.ok(out.some(i=>i.id.startsWith('skill:')&&i.quality.includes('FORECAST')));assert.ok(out.every(i=>i.impactISK===null));assert.ok(out.every(i=>i.reason&&i.source&&i.metric));});
test('Ready jobs and scheduled end dates are not delivered profit',()=>{const rows=[row('industry_job',{status:'ready',start_date:'2026-10-05T00:00:00Z',end_date:'2026-10-06T00:00:00Z',cost:100}),row('industry_job',{status:'active',start_date:'2026-10-05T00:00:00Z',end_date:'2026-10-06T00:00:00Z'})];const a=industryAnalysis(rows);assert.equal(a.delivered,0);assert.equal(a.active,1);assert.equal(a.ready,1);assert.equal(a.projectJobFeesISK,'100.00');assert.equal(a.missingJobFees,1);assert.equal(a.netProfitISK,null);});

test('Funding pace insights use configured targets instead of default targets',()=>{
 const now=new Date('2026-10-04T20:00:00Z');
 const reports=['MiningDailyReport','PiDailyReport','TradingDailyReport','IndustryStatusReport'].map(name=>{
  const raw=JSON.parse(readFileSync('examples/'+name+'.json','utf8'));
  raw.provenance='live';raw.status='actual';raw.reportType='daily';
  raw.period={from:'2026-10-04T00:00:00Z',to:'2026-10-04T23:59:59Z'};
  raw.generatedAt='2026-10-05T00:00:00Z';
  for(const key of ['realizedRevenue','operatingCosts','pocoCosts','costOfGoodsSold','brokerFees','salesTax','relistCosts'])if(key in raw.data)raw.data[key]=0;
  return validateReport(raw);
 });
 const raw=JSON.parse(readFileSync('seed/01-coordinator.json','utf8'));
 raw.provenance='live';raw.data.freeLiquidity=0;raw.data.releasedPlexContribution=0;
 raw.data.plexUnitPrice=5000000;raw.data.priceEvidence={source:'manual',fetchedAt:now.toISOString(),quality:'actual'};
 reports.push(validateReport(raw));
 assert.ok(buildInsights(reports,[],[],now).some(i=>i.id==='pace'));
 assert.ok(!buildInsights(reports,[],[],now,{sixMonthPlex:100,twelveMonthPlex:100}).some(i=>i.id==='pace'));
});
test('Missing daily insights are restricted to the project reporting period',()=>{
 for(const time of ['2026-10-03T10:00:00Z','2027-01-03T10:00:00Z'])
  assert.ok(!buildInsights([],[],[],new Date(time)).some(i=>i.id.startsWith('missing:')));
 assert.equal(buildInsights([],[],[],new Date('2026-10-08T10:00:00Z')).filter(i=>i.id.startsWith('missing:')).length,4);
});
