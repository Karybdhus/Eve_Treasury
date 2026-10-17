import {memoizedDatabaseRead} from './database-read-cache';
import {randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {z} from 'zod';
import {Contract,ContractItem} from './esi-contracts';
export const contractPurposes=['material_sale','material_purchase','internal_transfer','transport_order','transport_service','other','unknown'] as const;
export const contractDirections=['outgoing','incoming','exchange','internal','courier_issuer','courier_runner','unknown'] as const;
export type ContractPurpose=typeof contractPurposes[number];
export type ContractDirection=typeof contractDirections[number];
const Decision=z.object({contractId:z.string().regex(/^\d+$/),revision:z.number().int().nonnegative(),action:z.enum(['confirm','revoke']),purpose:z.enum(contractPurposes).optional(),direction:z.enum(contractDirections).optional(),reviewed:z.boolean().optional(),reason:z.string().trim().min(1).max(2000)}).strict();
type Management={purpose:ContractPurpose;direction:ContractDirection;reviewed:boolean;active:boolean;type:string;issuer:string;acceptor:string;corporation:boolean};
function archived(db:DatabaseSync,id:string){const r=db.prepare("SELECT body,fetched_at FROM project_records WHERE kind='contract_archive' AND source_entity_id=? ORDER BY fetched_at DESC LIMIT 1").get(id) as {body:string;fetched_at:string}|undefined;if(!r)throw new Error('Contract not archived');return r;}
function computeContractManagement(db:DatabaseSync,id:string){
 const row=archived(db,id),raw=JSON.parse(row.body),c=Contract.parse(raw);
 const own=new Set((db.prepare('SELECT character_id FROM characters').all() as {character_id:string}[]).map(r=>r.character_id));
 const issuerOwned=!c.for_corporation&&own.has(c.issuer_id),acceptorOwned=!c.for_corporation&&c.acceptor_id!=='0'&&own.has(c.acceptor_id);
 const role=issuerOwned&&acceptorOwned?'internal':issuerOwned?'issuer':acceptorOwned?'acceptor':'unknown';
 const settings=db.prepare('SELECT body FROM app_settings WHERE name=?').get('contract_purpose:'+id) as {body:string}|undefined;
 const saved=settings?JSON.parse(settings.body) as {purpose?:string;management?:Management}:{};
 const decision=db.prepare('SELECT revision,reason FROM contract_decisions WHERE contract_id=?').get(id) as {revision:number;reason:string}|undefined;
 const items=raw.items==null?null:z.array(ContractItem).parse(raw.items);
 const flow=(included:boolean):'incoming'|'outgoing'|'internal'|'unknown'=>role==='internal'?'internal':role==='issuer'?(included?'outgoing':'incoming'):role==='acceptor'?(included?'incoming':'outgoing'):'unknown';
 const itemFlows=items?.map(i=>({...i,direction:flow(i.is_included)}))??null;
 const flows=new Set(itemFlows?.filter(i=>BigInt(i.quantity)>0n).map(i=>i.direction));
 let direction:ContractDirection=role==='internal'?'internal':c.type==='courier'?(role==='issuer'?'courier_issuer':role==='acceptor'?'courier_runner':'unknown'):c.type==='item_exchange'&&role!=='unknown'&&items!==null?(flows.size===1&&flows.has('outgoing')?'outgoing':flows.size===1&&flows.has('incoming')?'incoming':flows.has('incoming')&&flows.has('outgoing')?'exchange':'unknown'):'unknown';
 let purpose:ContractPurpose=direction==='internal'?'internal_transfer':direction==='courier_issuer'?'transport_order':direction==='courier_runner'?'transport_service':direction==='outgoing'?'material_sale':direction==='incoming'?'material_purchase':'unknown';
 const legacyPurpose=saved.purpose??null;
 if(!saved.management&&legacyPurpose==='buyback')purpose='material_sale';
 if(!saved.management&&legacyPurpose==='other')purpose='other';
 const m=saved.management,conflicts:string[]=[];
 if(m?.active){
  if(m.type!==c.type||m.issuer!==c.issuer_id||m.acceptor!==c.acceptor_id||m.corporation!==c.for_corporation)conflicts.push('Contract role or technical type changed after confirmation');
  if(role==='internal'&&m.direction!=='internal')conflicts.push('Both contract parties are owned characters');
  if(role==='unknown'&&m.direction!=='unknown')conflicts.push('No supported personal ownership evidence');
  if(direction!=='unknown'&&m.direction!==direction)conflicts.push('Confirmed direction contradicts item or courier role evidence');
  purpose=m.purpose;direction=m.direction;
 }
 return {contractId:id,type:c.type,status:c.status,role,issuerOwned,acceptorOwned,issuerId:c.issuer_id,acceptorId:c.acceptor_id,assigneeId:c.assignee_id,purpose,direction,legacyPurpose,revision:decision?.revision??0,reason:decision?.reason??null,reviewed:!!m?.active&&m.reviewed&&conflicts.length===0,decisionActive:!!m?.active,quality:conflicts.length?'conflict':m?.active?'manually_confirmed':direction==='unknown'?'unknown':'proposed',conflicts,items:itemFlows,fetchedAt:row.fetched_at,completed:['finished','finished_issuer','finished_contractor'].includes(c.status),dateIssued:c.date_issued,dateCompleted:c.date_completed??null};
}
export function contractManagement(db:DatabaseSync,id:string){return memoizedDatabaseRead(db,'contract-management:'+id,()=>computeContractManagement(db,id));}
export function decideContractManagement(db:DatabaseSync,input:unknown){
 const v=Decision.parse(input);db.exec('BEGIN IMMEDIATE');try{
 const before=contractManagement(db,v.contractId);if(before.revision!==v.revision)throw new Error('Revision conflict; reload contract');
 const raw=Contract.parse(JSON.parse(archived(db,v.contractId).body));
 const active=v.action==='confirm';if(active&&(!v.purpose||!v.direction))throw new Error('Purpose and direction are required');
 const purpose=v.purpose??before.purpose,direction=v.direction??before.direction;
 if(active){
  if(before.role==='internal'&&(direction!=='internal'||purpose!=='internal_transfer'))throw new Error('Own-character contracts must remain internal');
  if(before.role==='unknown'&&direction!=='unknown')throw new Error('Personal ownership must be known before direction confirmation');
  if(raw.type==='courier'&&direction!==({issuer:'courier_issuer',acceptor:'courier_runner',internal:'internal',unknown:'unknown'} as const)[before.role])throw new Error('Courier direction contradicts own role');
  if(raw.type!=='courier'&&['courier_issuer','courier_runner'].includes(direction))throw new Error('Courier direction requires courier type');
  if(!['courier','item_exchange'].includes(raw.type)&&direction!=='unknown'&&direction!=='internal')throw new Error('Unsupported type must retain unknown direction');
  const expected={material_sale:'outgoing',material_purchase:'incoming',internal_transfer:'internal',transport_order:'courier_issuer',transport_service:'courier_runner'} as const;
  if(purpose in expected&&direction!==expected[purpose as keyof typeof expected])throw new Error('Purpose contradicts direction');
  const automatic=before.items?new Set(before.items.filter(i=>BigInt(i.quantity)>0n).map(i=>i.direction)):null;
  if(raw.type==='item_exchange'&&automatic?.size&&direction!=='unknown'&&direction!=='internal'){
   if(direction==='outgoing'&&!automatic.has('outgoing')||direction==='incoming'&&!automatic.has('incoming')||direction==='exchange'&&(!automatic.has('incoming')||!automatic.has('outgoing')))throw new Error('Direction contradicts observed item flow');
   if(automatic.has('incoming')&&automatic.has('outgoing')&&direction!=='exchange')throw new Error('Both incoming and outgoing items require exchange direction');
  }
 }
 const at=new Date().toISOString(),setting=db.prepare('SELECT body FROM app_settings WHERE name=?').get('contract_purpose:'+v.contractId) as {body:string}|undefined;
 const previous=setting?JSON.parse(setting.body):{};
 const management:Management={purpose,direction,reviewed:active&&(v.reviewed??true),active,type:raw.type,issuer:raw.issuer_id,acceptor:raw.acceptor_id,corporation:raw.for_corporation};
 db.prepare('INSERT INTO contract_decisions(contract_id,category,reason,expected_payout,revision,updated_at) VALUES(?,NULL,?,NULL,1,?) ON CONFLICT(contract_id) DO UPDATE SET reason=excluded.reason,revision=revision+1,updated_at=excluded.updated_at').run(v.contractId,v.reason,at);
 db.prepare('INSERT INTO app_settings VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at').run('contract_purpose:'+v.contractId,JSON.stringify({...previous,management}),at);
 const after=contractManagement(db,v.contractId);
 db.prepare('INSERT INTO reconciliation_audit VALUES(?,?,?,?)').run(randomUUID(),'contract_management_'+v.action,at,JSON.stringify({before,after,reason:v.reason}));db.exec('COMMIT');return after;
 }catch(error){db.exec('ROLLBACK');throw error;}
}
