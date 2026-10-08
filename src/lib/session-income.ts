import type {DatabaseSync} from 'node:sqlite';
import {listBuybacks} from './buyback';
import {records,storeRaw,storeRecord} from './source-records';
import {cents,decimal} from './money';
export function linkSessionIncome(db:DatabaseSync,sessionId:string,bookingId:string,confirmExclusive:boolean){
 if(confirmExclusive!==true)throw new Error('Confirm exclusive goods attribution to this session');
 db.exec('BEGIN IMMEDIATE');try{const s=db.prepare('SELECT type,ended_at FROM manual_sessions WHERE session_id=?').get(sessionId) as {type:string;ended_at:string|null}|undefined;
 if(!s?.ended_at)throw new Error('End the session before linking');
 const category=({hacking:'hacking',salvage:'salvage',ratting:'ratloot'} as Record<string,string>)[s.type];if(!category)throw new Error('Use the fleet view for mining income');
 const b=listBuybacks(db).find(b=>b.bookingId===bookingId);if(!b||b.historicalAggregate||b.reportingStatus!=='confirmed_payout'||!b.lines.some(l=>l.category===category&&l.actualPayoutISK!==null))throw new Error('Select a matching confirmed individual payout');
 const key='session-buyback:'+bookingId+':'+category,now=new Date().toISOString();
 if(db.prepare('SELECT deduplication_key FROM project_records WHERE deduplication_key=? AND is_current=1').get(key))throw new Error('Payout category already attributed to a session');const data={sessionId,bookingId,category,exclusive:true};const rawId=storeRaw(db,{source:'manual',endpoint:'session-income-link',entityId:key,fetchedAt:now,payloadText:JSON.stringify({...data,linkedAt:now})});storeRecord(db,{kind:'session_buyback_link',source:'manual',sourceClass:'manual',sourceEntityId:bookingId,fetchedAt:now,dataQuality:'measured',status:'actual',deduplicationKey:key,data,rawId});db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
}
export function sessionIncomeAnalytics(db:DatabaseSync){
 const sessions=records(db,'manual_session'),links=records(db,'session_buyback_link'),bookings=listBuybacks(db);
 return sessions.filter(s=>['hacking','salvage','ratting'].includes(String(s.data.type))).map(s=>{
  const incomeLinks=links.filter(l=>l.data.sessionId===s.sourceEntityId),lines=incomeLinks.flatMap(l=>{const b=bookings.find(b=>b.bookingId===l.data.bookingId&&b.reportingStatus==='confirmed_payout');return b?b.lines.filter(line=>line.category===l.data.category):[];});
  const revenue=lines.length?decimal(lines.reduce((n,l)=>n+cents(l.actualPayoutISK!),0n)):null;const hours=s.data.end?(Date.parse(String(s.data.end))-Date.parse(String(s.data.start)))/3600000:null;
  const net=lines.length&&lines.every(l=>l.operatingCostsISK!==null&&l.operatingCostsISK!==undefined)?decimal(lines.reduce((n,l)=>n+cents(l.actualPayoutISK!)-cents(l.operatingCostsISK!),0n)):null;
  return {sessionId:s.sourceEntityId!,type:String(s.data.type),characterId:s.sourceCharacterId,start:String(s.data.start),end:s.data.end?String(s.data.end):null,hours,revenueISK:revenue,netISK:net,revenuePerHour:hours&&revenue!==null?Number(revenue)/hours:null,netPerHour:hours&&net!==null?Number(net)/hours:null,links:incomeLinks.map(l=>l.deduplicationKey)};
 });
}
