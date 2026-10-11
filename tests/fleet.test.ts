import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/lib/db';
import {startFleet,endFleet,fleetAnalytics,linkFleetBuyback} from '../src/lib/fleet-sessions';
import {saveBuyback} from '../src/lib/buyback';
test('Fleet elapsed time is counted once; character hours are separate; sessions end idempotently',()=>{
 const db=openDatabase(':memory:');try{const start=new Date('2026-10-05T10:00:00Z'),end=new Date('2026-10-05T12:00:00Z'),s=startFleet(db,{characters:[{name:'Pilot A'},{name:'Pilot B'}]},start);
 assert.throws(()=>startFleet(db,{characters:[{name:'Pilot A'}]},start),/already/);assert.throws(()=>endFleet(db,s.sessionId,'2026-10-05T09:00:00Z',end),/Invalid/);
 const done=endFleet(db,s.sessionId,end.toISOString(),end);assert.equal(done.fleetHours,2);assert.equal(done.characterHours,4);assert.equal(endFleet(db,s.sessionId,'2026-10-05T13:00:00Z',new Date('2026-10-05T13:00:00Z')).fleetHours,2);assert.equal(fleetAnalytics(db)[0].revenueISK,null);
 }finally{db.close();}
});
test('Fleet payout match needs exclusive production evidence and never doubles bookkeeping',()=>{
 const db=openDatabase(':memory:');try{const start=new Date('2026-10-05T10:00:00Z'),end=new Date('2026-10-05T12:00:00Z'),s=startFleet(db,{characters:[{name:'Pilot'}]},start);endFleet(db,s.sessionId,end.toISOString(),end);
 const input={weekStart:'2026-10-05',reportingStatus:'confirmed_payout',actualPayoutISK:'900',payoutDate:'2026-10-07',contractId:'100',lines:[{category:'ore_ice',actualPayoutISK:'600',operatingCostsISK:'100'},{category:'pi',actualPayoutISK:'300'}]},b=saveBuyback(db,input);
 assert.throws(()=>linkFleetBuyback(db,s.sessionId,b.bookingId,false),/Confirm/);linkFleetBuyback(db,s.sessionId,b.bookingId,true);const a=fleetAnalytics(db)[0];assert.equal(a.revenueISK,'600.00');assert.equal(a.netProfitISK,'500.00');assert.equal(a.revenuePerFleetHour,300);assert.equal(a.netPerFleetHour,250);assert.throws(()=>linkFleetBuyback(db,s.sessionId,b.bookingId,true));assert.throws(()=>saveBuyback(db,{...input,bookingId:b.bookingId,expectedRevision:1}),/Remove the session link/);
 assert.equal((db.prepare('SELECT COUNT(*) AS n FROM buyback_bookings').get() as {n:number}).n,1);
 }finally{db.close();}
});
