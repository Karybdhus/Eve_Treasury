import type {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
export function detachFinancialSource(db:DatabaseSync,key:string,reason:string){
 const old=db.prepare('SELECT * FROM event_sources WHERE source_key=?').get(key) as {event_id:string}|undefined;
 if(!old)return;
 const row=db.prepare('SELECT body FROM financial_sources WHERE source_key=?').get(key) as {body:string},source=JSON.parse(row.body),now=new Date().toISOString();
 const peers=db.prepare('SELECT source_key FROM event_sources WHERE event_id=? AND source_key<>?').all(old.event_id,key) as {source_key:string}[];
 for(const p of peers)db.prepare("INSERT INTO reconciliation_decisions VALUES (?,'rejected',?,?) ON CONFLICT(pair_key) DO UPDATE SET status=excluded.status,reason=excluded.reason,changed_at=excluded.changed_at").run([key,p.source_key].sort().join('|'),reason,now);
 const id='event:'+randomUUID();db.prepare('INSERT INTO economic_events VALUES (?,?,1,?)').run(id,source.category,now);
 db.prepare("UPDATE event_sources SET event_id=?,method='manual_unlink',evidence=?,confirmed_at=?,manual=1 WHERE source_key=?").run(id,reason,now,key);
 db.prepare('UPDATE economic_events SET revision=revision+1 WHERE event_id=?').run(old.event_id);
 db.prepare('INSERT INTO reconciliation_audit VALUES (?,?,?,?)').run(randomUUID(),'unlink',now,JSON.stringify({sourceKey:key,reason,previous:old,eventId:id,peers}));
 const wallets=db.prepare('SELECT journal_key,booking_id FROM buyback_wallet_links WHERE journal_key=? OR booking_id=?').all(key,source.source==='buyback'?source.sourceId:'') as {journal_key:string;booking_id:string}[];
 for(const link of wallets){
  db.prepare('DELETE FROM buyback_wallet_links WHERE journal_key=?').run(link.journal_key);
  const booking=db.prepare('SELECT body FROM buyback_bookings WHERE booking_id=?').get(link.booking_id) as {body:string}|undefined;
  if(booking){const b=JSON.parse(booking.body);b.reconciliationStatus='unmatched';b.revision++;b.updatedAt=now;db.prepare('UPDATE buyback_bookings SET body=?,updated_at=? WHERE booking_id=?').run(JSON.stringify(b),now,b.bookingId);db.prepare('INSERT INTO buyback_audit VALUES (?,?,?,?,?)').run(randomUUID(),b.bookingId,'reconciliation_unlink',now,JSON.stringify(b));}
 }
}
