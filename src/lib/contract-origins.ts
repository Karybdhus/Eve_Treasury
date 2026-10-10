import type {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {contractManagement} from './contract-management';
import {inventoryPosition,reserveContractOrigin,releaseContractOrigin,type Slice,sliceCategories} from './inventory-provenance';
import {originEconomicCategory} from './economic-categories';
type Reservation=ReturnType<typeof reserveContractOrigin>;
export type ContractOriginLink={linkId:string;contractId:string;recordId:string;itemId:string;sliceId:string;quantity:string;status:'active'|'revoked';reason:string;reservation:Reservation};
export function contractOriginLinks(db:DatabaseSync,id:string){return (db.prepare('SELECT body,status FROM contract_item_origins WHERE contract_id=? ORDER BY created_at,link_id').all(id) as {body:string;status:ContractOriginLink['status']}[]).map(r=>({...JSON.parse(r.body),status:r.status} as ContractOriginLink));}
export function contractItemOrigins(db:DatabaseSync,id:string){const c=contractManagement(db,id),links=contractOriginLinks(db,id);return (c.items??[]).map(i=>{
 const active=links.filter(l=>l.status==='active'&&l.recordId===i.record_id),used=active.reduce((n,l)=>n+BigInt(l.quantity),0n),total=BigInt(i.quantity);
 return {...i,origins:active.map(l=>({...l,category:l.reservation.slice.unknownOrigin||new Set(sliceCategories(l.reservation.slice).map(originEconomicCategory)).size!==1?null:originEconomicCategory(sliceCategories(l.reservation.slice)[0]),lineage:l.reservation.slice.origins??null,costCents:l.reservation.costCents,quality:l.reservation.slice.status})),unknownQuantity:used<=total?(total-used).toString():null,conflict:used>total||active.some(l=>i.direction!=='outgoing'||i.type_id!==l.reservation.typeId||l.reservation.owner!==(c.role==='issuer'?c.issuerId:c.acceptorId))};
 });}
const Link=z.object({contractId:z.string().regex(/^\d+$/),contractRevision:z.number().int().nonnegative(),recordId:z.string().regex(/^\d+$/),itemId:z.string().regex(/^\d+$/),sliceId:z.string().uuid(),positionRevision:z.number().int().nonnegative(),quantity:z.string().regex(/^[1-9][0-9]*$/),reason:z.string().trim().min(1).max(2000)}).strict();
export function linkContractOrigin(db:DatabaseSync,input:unknown){const v=Link.parse(input);db.exec('BEGIN IMMEDIATE');try{
 const c=contractManagement(db,v.contractId);if(c.revision!==v.contractRevision)throw new Error('Revision conflict');
 if(c.type!=='item_exchange'||c.quality==='conflict'||c.role==='unknown'||c.role==='internal')throw new Error('External personal item exchange evidence required');
 const i=c.items?.find(i=>i.record_id===v.recordId);if(!i||i.direction!=='outgoing')throw new Error('Only outgoing contract items may consume origin');
 const p=inventoryPosition(db,v.itemId);if(!p||p.owner!==(c.role==='issuer'?c.issuerId:c.acceptorId)||p.typeId!==i.type_id)throw new Error('Origin owner or type mismatch');
 if(!Number.isFinite(Date.parse(p.asOf))||Date.parse(p.asOf)>Date.parse(c.dateIssued))throw new Error('Origin observation must precede contract issue');
 const used=contractOriginLinks(db,v.contractId).filter(l=>l.status==='active'&&l.recordId===v.recordId).reduce((n,l)=>n+BigInt(l.quantity),0n);if(used+BigInt(v.quantity)>BigInt(i.quantity))throw new Error('Contract item capacity exceeded');
 const id=randomUUID(),reservation=reserveContractOrigin(db,{itemId:v.itemId,revision:v.positionRevision,sliceId:v.sliceId,quantity:v.quantity,reason:v.reason,reservationId:id});
 const link:ContractOriginLink={linkId:id,contractId:v.contractId,recordId:v.recordId,itemId:v.itemId,sliceId:v.sliceId,quantity:v.quantity,status:'active',reason:v.reason,reservation};
 const at=new Date().toISOString();db.prepare('INSERT INTO contract_item_origins VALUES(?,?,?,?,?,?,\'active\',?,?,NULL)').run(id,v.contractId,v.recordId,v.itemId,v.sliceId,v.quantity,JSON.stringify(link),at);
 bump(db,v.contractId,v.reason,at);audit(db,'contract_origin_link',link,at);db.exec('COMMIT');return link;
 }catch(e){db.exec('ROLLBACK');throw e;}}
function bump(db:DatabaseSync,id:string,reason:string,at:string){db.prepare('INSERT INTO contract_decisions(contract_id,category,reason,expected_payout,revision,updated_at) VALUES(?,NULL,?,NULL,1,?) ON CONFLICT(contract_id) DO UPDATE SET revision=revision+1,updated_at=excluded.updated_at').run(id,reason,at);}
function audit(db:DatabaseSync,action:string,body:unknown,at:string){db.prepare('INSERT INTO reconciliation_audit VALUES(?,?,?,?)').run(randomUUID(),action,at,JSON.stringify(body));}
export function revokeContractOrigin(db:DatabaseSync,input:{linkId:string;contractRevision:number;reason:string;positionRevision?:number}){
 z.object({linkId:z.string().uuid(),contractRevision:z.number().int().nonnegative(),reason:z.string().trim().min(1).max(2000),positionRevision:z.number().int().positive().optional()}).strict().parse(input);
 db.exec('BEGIN IMMEDIATE');try{const row=db.prepare("SELECT body FROM contract_item_origins WHERE link_id=? AND status='active'").get(input.linkId) as {body:string}|undefined;if(!row)throw new Error('Active origin link not found');const l=JSON.parse(row.body) as ContractOriginLink;
 if(contractManagement(db,l.contractId).revision!==input.contractRevision)throw new Error('Revision conflict');
 if(input.positionRevision!==undefined){const p=inventoryPosition(db,l.itemId),slice=p?.slices.find(s=>s.id===l.sliceId);if(!p||p.revision!==input.positionRevision||p.asOf!==l.reservation.asOf||p.owner!==l.reservation.owner||slice?.category!==l.reservation.slice.category||slice.method!==l.reservation.slice.method||!l.reservation.auditRowid)throw new Error('Stock evidence changed; explicit stock correction required');const consumed=db.prepare("SELECT 1 FROM inventory_audit WHERE item_id=? AND rowid>? AND action='consumed_observation_confirmed' LIMIT 1").get(l.itemId,l.reservation.auditRowid);if(consumed)throw new Error('Reservation may already be consumed; stock correction required');}
 releaseContractOrigin(db,{...l.reservation,positionRevision:input.positionRevision??l.reservation.positionRevision,itemId:l.itemId,reservationId:l.linkId,reason:input.reason,slice:l.reservation.slice as Slice});
 const at=new Date().toISOString();db.prepare("UPDATE contract_item_origins SET status='revoked',revoked_at=? WHERE link_id=?").run(at,l.linkId);bump(db,l.contractId,input.reason,at);audit(db,'contract_origin_revoke',{link:l,reason:input.reason},at);db.exec('COMMIT');return contractItemOrigins(db,l.contractId);
 }catch(e){db.exec('ROLLBACK');throw e;}}
