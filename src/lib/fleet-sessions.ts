import {z} from 'zod';
import type {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {listBuybacks} from './buyback';
import {cents,decimal} from './money';
export const FleetInput=z.object({startedAt:z.iso.datetime({offset:true}).optional(),notes:z.string().max(4000).default(''),characters:z.array(z.object({characterId:z.string().regex(/^\d+$/).optional(),name:z.string().min(1).max(100)}).strict()).min(1).max(30)}).strict();
export type FleetSession={sessionId:string;startedAt:string;endedAt:string|null;characters:z.infer<typeof FleetInput>['characters'];notes:string;fleetHours:number|null;characterHours:number|null};
export function fleetSessions(db:DatabaseSync):FleetSession[]{return (db.prepare('SELECT body FROM fleet_sessions ORDER BY started_at DESC').all() as {body:string}[]).map(r=>JSON.parse(r.body));}
export function startFleet(db:DatabaseSync,input:unknown,now=new Date()):FleetSession{
 const parsed=FleetInput.parse(input),start=parsed.startedAt??now.toISOString();if(Date.parse(start)>now.getTime())throw new Error('Start must not be in the future');
 const keys=parsed.characters.map(c=>c.characterId??c.name.trim().toLowerCase());if(new Set(keys).size!==keys.length)throw new Error('Duplicate fleet participant');
 const active=fleetSessions(db).filter(s=>!s.endedAt);if(active.some(s=>s.characters.some(c=>keys.includes(c.characterId??c.name.trim().toLowerCase()))))throw new Error('Character already in an open fleet session');
 const s:FleetSession={sessionId:randomUUID(),startedAt:start,endedAt:null,characters:parsed.characters,notes:parsed.notes,fleetHours:null,characterHours:null};db.prepare('INSERT INTO fleet_sessions VALUES (?,?,NULL,?)').run(s.sessionId,start,JSON.stringify(s));return s;
}
export function endFleet(db:DatabaseSync,id:string,endedAt=new Date().toISOString(),now=new Date()):FleetSession{
 z.uuid().parse(id);z.iso.datetime({offset:true}).parse(endedAt);const s=fleetSessions(db).find(s=>s.sessionId===id);if(!s)throw new Error('Fleet session not found');if(s.endedAt)return s;if(Date.parse(endedAt)<Date.parse(s.startedAt)||Date.parse(endedAt)>now.getTime())throw new Error('Invalid end time');
 const hours=(Date.parse(endedAt)-Date.parse(s.startedAt))/3600000;const result={...s,endedAt,fleetHours:hours,characterHours:hours*s.characters.length};db.prepare('UPDATE fleet_sessions SET ended_at=?,body=? WHERE session_id=? AND ended_at IS NULL').run(endedAt,JSON.stringify(result),id);return result;
}
export function linkFleetBuyback(db:DatabaseSync,sessionId:string,bookingId:string,confirmExclusive:boolean){
 if(confirmExclusive!==true)throw new Error('Confirm that all ORE/ICE in this payout belongs to this fleet session');
 const s=fleetSessions(db).find(s=>s.sessionId===sessionId),b=listBuybacks(db).find(b=>b.bookingId===bookingId);
 if(!s?.endedAt||!s.fleetHours)throw new Error('End the fleet session before linking');
 if(!b||b.historicalAggregate||b.reportingStatus!=='confirmed_payout')throw new Error('Select an individual confirmed payout');
 if(!b.lines.some(l=>l.category==='ore_ice'&&l.actualPayoutISK!==null))throw new Error('Payout has no ORE/ICE category');
 db.prepare('INSERT INTO fleet_buyback_links VALUES (?,?,?)').run(bookingId,sessionId,new Date().toISOString());
}
export function fleetAnalytics(db:DatabaseSync){
 const links=db.prepare('SELECT booking_id,session_id FROM fleet_buyback_links').all() as {booking_id:string;session_id:string}[],bookings=listBuybacks(db);
 return fleetSessions(db).map(s=>{
  const matched=links.filter(l=>l.session_id===s.sessionId).flatMap(l=>{const b=bookings.find(b=>b.bookingId===l.booking_id&&b.reportingStatus==='confirmed_payout');return b?b.lines.filter(line=>line.category==='ore_ice'):[];});
  const revenue=matched.length?decimal(matched.reduce((n,l)=>n+cents(l.actualPayoutISK!),0n)):null;
  const net=matched.length&&matched.every(l=>l.operatingCostsISK!=null)?decimal(matched.reduce((n,l)=>n+cents(l.actualPayoutISK!)-cents(l.operatingCostsISK!),0n)):null;
  return {...s,revenueISK:revenue,netProfitISK:net,revenuePerFleetHour:revenue!==null&&s.fleetHours?Number(revenue)/s.fleetHours:null,netPerFleetHour:net!==null&&s.fleetHours?Number(net)/s.fleetHours:null,linkedBookings:links.filter(l=>l.session_id===s.sessionId).map(l=>l.booking_id)};
 });
}
