import {z} from 'zod';
import type {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {Money,cents,canonical,decimal,totalMoney} from './money';
import {weekStart,project} from './accounting';
import {dateKey} from './time';
export const categories=['ore_ice','ratloot','hacking','salvage','pi','unallocated'] as const;
export const categoryLabels:Record<string,string>={ore_ice:'ORE/ICE',ratloot:'Ratloot',hacking:'Hacking',salvage:'Salvage',pi:'PI',unallocated:'Nicht zugeordnet'};
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v,'Invalid calendar date');
const line=z.object({category:z.enum(categories),actualPayoutISK:Money.nullable(),janiceValueISK:Money.nullable().optional(),operatingCostsISK:Money.nullable().optional()}).strict();
export const BookingInput=z.object({bookingId:z.uuid().optional(),expectedRevision:z.number().int().nonnegative().optional(),weekStart:day,reportingStatus:z.enum(['draft','valuation','contract_created','confirmed_payout','cancelled','not_reported']),actualPayoutISK:Money.nullable(),payoutDate:day.nullable().optional(),contractId:z.string().regex(/^\d+$/).nullable().optional(),characterId:z.string().regex(/^\d+$/).nullable().optional(),counterparty:z.string().max(200).optional(),notes:z.string().max(4000).optional(),lines:z.array(line).min(1).max(30)}).strict().superRefine((b,ctx)=>{
 if(weekStart(b.weekStart)!==b.weekStart)ctx.addIssue({code:'custom',message:'Week must start on Monday',path:['weekStart']});
 if(new Set(b.lines.map(l=>l.category)).size!==b.lines.length)ctx.addIssue({code:'custom',message:'Use one line per category within a contract',path:['lines']});
 if(b.actualPayoutISK!==null){const sum=totalMoney(b.lines.map(l=>l.actualPayoutISK));if(sum===null||cents(sum)!==cents(b.actualPayoutISK))ctx.addIssue({code:'custom',message:'Category amounts must equal the single contract payout',path:['lines']});}
 if(b.reportingStatus==='confirmed_payout'&&b.actualPayoutISK===null)ctx.addIssue({code:'custom',message:'Confirmed payout requires an actual amount',path:['actualPayoutISK']});
 if(b.payoutDate&&b.payoutDate>dateKey(new Date()))ctx.addIssue({code:'custom',message:'Payout date cannot be in the future',path:['payoutDate']});
});
export type Booking=Omit<z.infer<typeof BookingInput>,'expectedRevision'> & {bookingId:string;weekEnd:string;source:'manual'|'import';reconciliationStatus:'unmatched'|'matched';createdAt:string;updatedAt:string;revision:number;historicalAggregate:boolean;sourceKey?:string};
export function listBuybacks(db:DatabaseSync):Booking[]{return (db.prepare('SELECT body FROM buyback_bookings ORDER BY week_start DESC,created_at DESC').all() as {body:string}[]).map(r=>JSON.parse(r.body));}
function audit(db:DatabaseSync,b:Booking,action:string){db.prepare('INSERT INTO buyback_audit VALUES (?,?,?,?,?)').run(randomUUID(),b.bookingId,action,new Date().toISOString(),JSON.stringify(b));}
export function saveBuyback(db:DatabaseSync,input:unknown):Booking{
 const b=BookingInput.parse(input);const existing=b.bookingId?listBuybacks(db).find(x=>x.bookingId===b.bookingId):undefined;
 if(b.bookingId&&!existing)throw new Error('Booking not found');
 if(existing?.historicalAggregate)throw new Error('Historical aggregates are immutable. Import a reviewed correction separately.');
 if(existing&&b.expectedRevision!==existing.revision)throw new Error('Booking changed. Reload before editing.');
 if(existing?.reconciliationStatus==='matched')throw new Error('Matched payout is locked. Remove the wallet link before editing.');
 const now=new Date().toISOString();const start=new Date(b.weekStart+'T12:00:00Z');start.setUTCDate(start.getUTCDate()+6);
 const saved:Booking={...b,bookingId:existing?.bookingId??randomUUID(),weekEnd:start.toISOString().slice(0,10),source:'manual',reconciliationStatus:'unmatched',createdAt:existing?.createdAt??now,updatedAt:now,revision:(existing?.revision??0)+1,historicalAggregate:false,actualPayoutISK:b.actualPayoutISK===null?null:canonical(b.actualPayoutISK),lines:b.lines.map(l=>({...l,actualPayoutISK:l.actualPayoutISK===null?null:canonical(l.actualPayoutISK),janiceValueISK:l.janiceValueISK==null?null:canonical(l.janiceValueISK),operatingCostsISK:l.operatingCostsISK==null?null:canonical(l.operatingCostsISK)}))};
 db.exec('BEGIN IMMEDIATE');
 try{
  if(saved.contractId&&listBuybacks(db).some(x=>x.bookingId!==saved.bookingId&&x.contractId===saved.contractId&&x.reportingStatus!=='cancelled'))throw new Error('Contract already recorded. Edit its category split instead.');
  db.prepare('INSERT INTO buyback_bookings VALUES (?,?,?,?,?,?) ON CONFLICT(booking_id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at').run(saved.bookingId,saved.weekStart,saved.contractId??null,JSON.stringify(saved),saved.createdAt,now);audit(db,saved,existing?'edit':'create');db.exec('COMMIT');return saved;
 }catch(e){db.exec('ROLLBACK');throw e;}
}
export function cancelBuyback(db:DatabaseSync,id:string,revision:number){const b=listBuybacks(db).find(x=>x.bookingId===id);if(!b)throw new Error('Booking not found');return saveBuyback(db,{bookingId:id,expectedRevision:revision,weekStart:b.weekStart,reportingStatus:'cancelled',actualPayoutISK:b.actualPayoutISK,payoutDate:b.payoutDate,contractId:b.contractId,characterId:b.characterId,counterparty:b.counterparty,notes:b.notes,lines:b.lines});}
export function inProject(b:Booking,start=project.start,end=project.end){
 if(b.reportingStatus!=='confirmed_payout')return false;
 if(b.payoutDate)return b.payoutDate>=start&&b.payoutDate<=end;
 // A full weekly aggregate can be attributed; overlap weeks require individual proof.
 return b.weekStart>=start&&b.weekEnd<=end;
}
export function buybackAnalytics(bookings:Booking[],start=project.start,end=project.end){
 const actual=bookings.filter(b=>b.reportingStatus==='confirmed_payout');
 const selected=actual.filter(b=>inProject(b,start,end));
 const byCategory=categories.map(category=>({category,revenueISK:totalMoney(selected.flatMap(b=>b.lines.filter(l=>l.category===category).map(l=>l.actualPayoutISK)))}));
 const buckets=(grain:'week'|'month'|'year')=>[...new Set(actual.map(b=>grain==='week'?b.weekStart:(b.payoutDate??b.weekStart).slice(0,grain==='year'?4:7)))].sort().map(period=>{const rows=actual.filter(b=>(grain==='week'?b.weekStart:(b.payoutDate??b.weekStart).slice(0,grain==='year'?4:7))===period);return {period,revenueISK:totalMoney(rows.map(b=>b.actualPayoutISK)),missingDates:rows.filter(b=>!b.payoutDate).length};});
 return {revenueISK:totalMoney(selected.map(b=>b.actualPayoutISK)),historicalRevenueISK:totalMoney(actual.filter(b=>!inProject(b,start,end)).map(b=>b.actualPayoutISK)),byCategory,weeks:buckets('week'),months:buckets('month'),years:buckets('year'),open:bookings.filter(b=>['draft','valuation','contract_created'].includes(b.reportingStatus)).length,unallocatedISK:byCategory.find(x=>x.category==='unallocated')?.revenueISK??null,unknownDates:actual.filter(b=>!b.payoutDate).length,netProfitISK:selected.length&&selected.every(b=>b.lines.every(l=>l.operatingCostsISK!=null))?decimal(selected.reduce((n,b)=>n+cents(b.actualPayoutISK!)-b.lines.reduce((s,l)=>s+cents(l.operatingCostsISK!),0n),0n)):null};
}
export function linkBuybackWallet(db:DatabaseSync,bookingId:string,journalKey:string){
 const b=listBuybacks(db).find(x=>x.bookingId===bookingId);if(!b||b.reportingStatus!=='confirmed_payout'||b.historicalAggregate)throw new Error('Select a confirmed individual payout');
 const row=db.prepare("SELECT body,source_character_id FROM project_records WHERE deduplication_key=? AND kind='wallet_journal' AND source='esi'").get(journalKey) as {body:string;source_character_id:string}|undefined;
 if(!row)throw new Error('Journal entry not found');const data=JSON.parse(row.body);
 if(!['contract_price','player_donation'].includes(data.ref_type))throw new Error('Select a contract payment or explicitly classified donation; bounties and market sales are not buyback payouts');
 if(b.characterId&&row.source_character_id!==b.characterId)throw new Error('Character mismatch');
 if(typeof data.amount!=='number'||data.amount<=0||cents(data.amount.toFixed(2))!==cents(b.actualPayoutISK!))throw new Error('Wallet amount must match the whole payout');
 if(b.payoutDate&&dateKey(data.date)!==b.payoutDate)throw new Error('Wallet payout date mismatch');
 db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO buyback_wallet_links VALUES (?,?)').run(journalKey,bookingId);const saved={...b,reconciliationStatus:'matched' as const,revision:b.revision+1,updatedAt:new Date().toISOString()};db.prepare('UPDATE buyback_bookings SET body=?,updated_at=? WHERE booking_id=?').run(JSON.stringify(saved),saved.updatedAt,bookingId);audit(db,saved,'wallet_link');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
}
export function unlinkBuybackWallet(db:DatabaseSync,bookingId:string){
 const b=listBuybacks(db).find(x=>x.bookingId===bookingId);if(!b)throw new Error('Booking not found');db.exec('BEGIN IMMEDIATE');try{db.prepare('DELETE FROM buyback_wallet_links WHERE booking_id=?').run(bookingId);const saved={...b,reconciliationStatus:'unmatched' as const,revision:b.revision+1,updatedAt:new Date().toISOString()};db.prepare('UPDATE buyback_bookings SET body=?,updated_at=? WHERE booking_id=?').run(JSON.stringify(saved),saved.updatedAt,bookingId);audit(db,saved,'wallet_unlink');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
}
