import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openDatabase} from '../src/lib/db';
import {storeRecord,storeRaw,type ProjectRecord} from '../src/lib/source-records';
import {assetGroups} from '../src/lib/asset-groups';
import {financialReadModel,financialRevision} from '../src/lib/financial-read-model';
import {consolidatedFinancials,collectFinancialSources} from '../src/lib/reconciliation';
import {walletLiquidity} from '../src/lib/dashboard-statistics';
import {nameResolver} from '../src/lib/names';
function row(kind:string,owner:string,id:string,data:Record<string,unknown>):ProjectRecord{return {kind,source:'esi',sourceClass:'automatic',sourceCharacterId:owner,sourceEntityId:id,fetchedAt:'2026-10-08T00:00:00Z',sourceTimestamp:'2026-10-08T00:00:00Z',dataQuality:'measured',status:'actual',deduplicationKey:owner+':'+kind+':'+id,data};}
test('Three-character asset aggregation preserves unique items, provenance and unknown quantities',()=>{
 const rows=[row('asset_snapshot','1','1',{item_id:'1',type_id:'34',quantity:200,location_id:'10'}),row('asset_snapshot','2','2',{item_id:'2',type_id:'34',quantity:300,location_id:'20'}),row('asset_snapshot','3','3',{item_id:'3',type_id:'34',quantity:100,location_id:'30'})];
 assert.equal(assetGroups(rows)[0].quantity,'600');assert.equal(assetGroups(rows.filter(r=>r.sourceCharacterId==='2'))[0].quantity,'300');
 assert.equal(new Set(assetGroups(rows)[0].positions.map(p=>p.owner)).size,3);
 const singleton=row('asset_snapshot','1','4',{item_id:'4',type_id:'34',quantity:1,is_singleton:true});
 const copy=row('asset_snapshot','1','5',{item_id:'5',type_id:'34',quantity:-2,is_blueprint_copy:true});
 assert.equal(assetGroups([...rows,singleton,copy]).length,3);assert.equal(assetGroups([copy])[0].quantity,null);
 assert.equal(assetGroups([rows[0],{...rows[0],sourceCharacterId:'2',fetchedAt:'2026-10-09T00:00:00Z'}])[0].positions.length,1);
 assert.equal(nameResolver([]).type('999999999'),'Name noch nicht verfuegbar');
 const large=Array.from({length:6000},(_,i)=>row('asset_snapshot',String(i%3),String(i),{item_id:String(i),type_id:'34',quantity:1,location_id:String(i%20)}));
 assert.equal(assetGroups(large)[0].quantity,'6000');
});
test('Financial read model reuses unchanged sources and invalidates real financial decisions',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'eve-night05-')),db=openDatabase(path.join(dir,'fixture.sqlite'));
 try{
  for(const id of ['1','2','3'])db.prepare('INSERT INTO characters VALUES (?,?,?,?,?,?,?,NULL,NULL)').run(id,'Fixture'+id,'[]','fixture','connected','fixture','2026-10-08T00:00:00Z');
  for(const id of ['1','2','3'])storeRecord(db,row('wallet_journal',id,id,{id,date:'2026-10-06T00:00:00Z',ref_type:'bounty_prizes',amount:Number(id)*100}));
  const first=financialReadModel(db);assert.equal(financialReadModel(db),first);
  const all=consolidatedFinancials(db,{},first);assert.equal(all.realizedBountyISK,'600.00');
  assert.equal(consolidatedFinancials(db,{characterId:'2'},first).realizedBountyISK,'200.00');
  const old=financialRevision(db);storeRecord(db,row('type_metadata','','34',{name:'Tritanium'}));assert.equal(financialRevision(db),old);
  storeRecord(db,row('wallet_journal','1','4',{id:'4',date:'2026-10-06T00:00:00Z',ref_type:'player_donation',first_party_id:'1',second_party_id:'2',amount:999}));
  const next=financialReadModel(db);assert.notEqual(next,first);assert.equal(consolidatedFinancials(db,{},next).realizedBountyISK,'600.00');
  assert.ok(next.sources.find(r=>r.sourceId==='4')?.category==='INTERNAL_TRANSFER');
  db.prepare("UPDATE economic_events SET category='OTHER_INCOME',revision=revision+1 WHERE event_id=?").run(next.events[0].event_id);assert.notEqual(financialReadModel(db),next);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('Shared large raw wallet response is selected once per response while preserving exact int64 evidence',()=>{
 const db=openDatabase(':memory:');try{
  const rawId=storeRaw(db,{source:'esi',characterId:'1',endpoint:'/journal',fetchedAt:'2026-10-08T00:00:00Z',payloadText:'[{"id":9223372036854775807,"amount":123.45,"date":"2026-10-06T00:00:00Z","ref_type":"bounty_prizes"}]'});
  storeRecord(db,{...row('wallet_journal','1','9223372036854775807',{id:'9223372036854775807',amount:123.45,date:'2026-10-06T00:00:00Z',ref_type:'bounty_prizes'}),rawId});
  assert.equal(collectFinancialSources(db)[0].amountISK,'123.45');
  assert.equal(walletLiquidity(['1','2','3'].map(id=>row('wallet_balance',id,id,{wallet:Number(id)*100}))).amountISK,'600.00');
 }finally{db.close();}
});
