import type {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {signedCents,exactSum} from './exact-money';
const amount=z.string().regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/).nullable();
export const CostComponent=z.object({sourceKey:z.string().min(1).max(300),kind:z.enum(['fee','tax','acquisition','production','operating']),treatment:z.enum(['included','separate','unknown']),amountISK:amount,grossISK:amount,netISK:amount,reason:z.string().trim().min(1).max(2000),expectedRevision:z.number().int().positive()}).strict();
export function recordCostComponent(db:DatabaseSync,raw:unknown){const c=CostComponent.parse(raw);db.exec('BEGIN IMMEDIATE');try{
 const event=db.prepare('SELECT event_id FROM event_sources WHERE source_key=?').get(c.sourceKey) as {event_id:string}|undefined;if(!event)throw new Error('Source event missing');
 const old=db.prepare("SELECT amount_decimal FROM event_cost_components WHERE event_id=? AND treatment=?").all(event.event_id,c.treatment) as {amount_decimal:string|null}[];
 if(c.treatment!=='unknown'&&c.grossISK!==null&&c.netISK!==null){const sum=exactSum([...old.map(x=>x.amount_decimal),c.amountISK]);if(sum===null||signedCents(c.grossISK)-signedCents(c.netISK)!==signedCents(sum))throw new Error('Cost components must reconcile gross minus net exactly');}
 if(db.prepare('UPDATE economic_events SET revision=revision+1 WHERE event_id=? AND revision=?').run(event.event_id,c.expectedRevision).changes!==1)throw new Error('Event changed; reload');
 const id=randomUUID(),now=new Date().toISOString();db.prepare('INSERT INTO event_cost_components VALUES (?,?,?,?,?,?,?,?,?)').run(id,event.event_id,c.kind,c.treatment,c.amountISK,c.grossISK,c.netISK,c.reason,now);db.prepare('INSERT INTO reconciliation_audit VALUES (?,?,?,?)').run(randomUUID(),'cost_component',now,JSON.stringify({id,eventId:event.event_id,...c}));db.exec('COMMIT');return id;
 }catch(e){db.exec('ROLLBACK');throw e;}}
export function costComponents(db:DatabaseSync){return db.prepare('SELECT * FROM event_cost_components ORDER BY created_at').all().map(x=>({...x}));}