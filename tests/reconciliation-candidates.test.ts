import test from 'node:test';
import assert from 'node:assert/strict';
import {reconciliationCandidates} from '../src/lib/reconciliation-candidates';
import type {FinancialSource} from '../src/lib/reconciliation';
import {signedCents} from '../src/lib/exact-money';

function source(i:number):FinancialSource{return {key:'source:'+i,source:'esi',sourceId:String(i),characterId:null,date:'2026-10-07',category:'OTHER_INCOME',amountISK:String(i+1)+'.00',costsISK:null,netISK:null,status:'actual',precision:'exact',eligible:true,role:'cash',identity:null,references:[],legacy:false,complete:true,raw:{}};}
test('Indexed candidates retain every exhaustive identity/reference/amount-day/wallet possibility',()=>{
 const sources=Array.from({length:180},(_,i)=>({...source(i),eligible:i%17!==0,role:i%9===0?'report' as const:'cash' as const,identity:i%5===0?'contract:'+i%20:null,amountISK:i%7===0?'100.00':i%11===0?'-5.00':String(i+1)+'.00',references:i%8===0?['source:'+((i+3)%180)]:i%13===0?[String((i+4)%180)]:i%19===0?['contract:5']:[]}));
 sources[1]={...sources[1],key:'buyback:fixture',source:'buyback'};
 const walletLinks=[{journal_key:sources[2].key,booking_id:'fixture'}];
 const candidates=reconciliationCandidates(sources,walletLinks),actual=new Set(candidates.map(([i,j])=>i+':'+j));
 let expected=0;
 for(let i=0;i<sources.length;i++)for(let j=i+1;j<sources.length;j++){
  const a=sources[i],b=sources[j];if(!a.eligible||!b.eligible)continue;
  const strong=(a.identity!==null&&a.identity===b.identity||a.references.includes(b.identity??'')||b.references.includes(a.identity??''))&&a.role!=='report'&&b.role!=='report';
  const refs=a.references.some(r=>[b.key,b.sourceId,b.identity].includes(r))||b.references.some(r=>[a.key,a.sourceId,a.identity].includes(r));
  const amountDate=a.amountISK!==null&&signedCents(a.amountISK)>0n&&a.amountISK===b.amountISK&&a.date!==null&&a.date===b.date;
  const wallet=walletLinks.find(w=>w.journal_key===(a.source==='esi'?a.key:b.key));
  const explicit=wallet&&'buyback:'+wallet.booking_id===(a.source==='buyback'?a.key:b.key);
  if(strong||refs||amountDate||explicit){expected++;assert.ok(actual.has(i+':'+j),'Missing pair '+i+':'+j);}
 }
 assert.ok(expected>0);assert.equal(actual.size,candidates.length);assert.deepEqual(candidates,[...candidates].sort((a,b)=>a[0]-b[0]||a[1]-b[1]));
});
test('Large unrelated histories avoid exhaustive pairs while repeated equal payments remain proposals',()=>{
 const sources=Array.from({length:10000},(_,i)=>source(i));
 assert.equal(reconciliationCandidates(sources,[]).length,0);
 sources[1].amountISK=sources[2].amountISK;
 assert.deepEqual(reconciliationCandidates(sources,[]),[[1,2]]);
 sources[3].identity=sources[4].identity=sources[5].identity='contract:multi-payment';
 const candidates=reconciliationCandidates(sources,[]);
 for(const pair of [[3,4],[3,5],[4,5]])assert.ok(candidates.some(p=>p[0]===pair[0]&&p[1]===pair[1]));
});
