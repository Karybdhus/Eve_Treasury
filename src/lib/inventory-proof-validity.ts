import {contractManagement} from './contract-management';
import {readWalletBinding,currentWalletBinding} from './contract-wallet-state';
import type {DatabaseSync} from 'node:sqlite';
import {moneyFact,signedCents} from './exact-money';
import type {ConsumedLot,OriginLot} from './inventory-continuity';
// Old acquisition costs cannot remain proven after their source has changed.
export function currentConsumedOrigin(db:DatabaseSync,segment:ConsumedLot,visited=new Set<string>()):ConsumedLot{
 if(visited.has(segment.lotId))return {...segment,category:null,quality:'conflict',costCents:null};visited.add(segment.lotId);
 const row=db.prepare('SELECT body FROM inventory_origin_lots WHERE id=?').get(segment.lotId);if(!row)return segment;
 const lot=JSON.parse(String(row.body)) as OriginLot;
 if(lot.quality==='manually_confirmed')return segment;
 if(lot.quality==='rule_based'){
  const pending=db.prepare("SELECT r.deduplication_key,r.body,r.fetched_at FROM project_records r WHERE r.kind='wallet_transaction' AND r.source='esi' AND r.status='actual' AND r.is_current=1 AND r.source_character_id=? AND CAST(json_extract(r.body,'$.type_id') AS TEXT)=? AND json_extract(r.body,'$.is_buy')=1 AND NOT EXISTS(SELECT 1 FROM inventory_origin_lots l WHERE l.source_key=r.deduplication_key) AND NOT EXISTS(SELECT 1 FROM inventory_state s WHERE s.name='origin-proof:'||r.deduplication_key)").all(lot.owner,lot.typeId);
  const own=new Set(db.prepare('SELECT character_id FROM characters').all().map(r=>String(r.character_id)));
  if(pending.some(row=>{const data=JSON.parse(String(row.body));return data.is_personal===true&&!own.has(String(data.client_id))&&Number.isFinite(Date.parse(data.date))&&Date.parse(data.date)<=Date.parse(lot.acquiredAt)&&Date.parse(String(row.fetched_at))>=Date.parse(lot.acquiredAt)&&/^[1-9][0-9]*$/.test(String(data.quantity));}))return {...segment,category:null,quality:'conflict',costCents:null};
 }

 const purchaseKey=lot.evidence.find(key=>key.startsWith('esi:')&&key.includes(':wallet_transaction:'));
 if(lot.origin==='MARKET_PURCHASE'&&purchaseKey&&!lot.lineage?.length){
  const proof=db.prepare('SELECT body,status,source,source_character_id FROM project_records WHERE deduplication_key=? AND is_current=1').get(purchaseKey);
  const data=proof?JSON.parse(String(proof.body)):null,unit=moneyFact(data?.unit_price).value;
  const valid=proof?.status==='actual'&&proof.source==='esi'&&String(proof.source_character_id)===lot.owner&&data?.is_buy===true&&data?.is_personal===true&&String(data.type_id)===lot.typeId&&String(data.quantity)===lot.quantity&&Number.isFinite(Date.parse(data.date))&&Date.parse(data.date)===Date.parse(lot.acquiredAt)&&(lot.costCents===null||unit!==null&&signedCents(unit)*BigInt(lot.quantity)===BigInt(lot.costCents));
  if(!valid)return {...segment,category:null,quality:'conflict',costCents:null};
 }
 if(lot.origin==='CONTRACT_PURCHASE'&&!lot.lineage?.length){
  const archive=lot.evidence.map(key=>db.prepare("SELECT body,source_entity_id FROM project_records WHERE deduplication_key=? AND kind='contract_archive' AND is_current=1").get(key)).find(Boolean);
  const paymentKey=lot.evidence.find(key=>db.prepare("SELECT 1 FROM project_records WHERE deduplication_key=? AND kind='wallet_journal' AND is_current=1").get(key));
  if(archive&&paymentKey){const receipt=db.prepare('SELECT body,source_character_id FROM project_records WHERE deduplication_key=? AND is_current=1').get(paymentKey)!,binding=readWalletBinding(db,paymentKey),contract=contractManagement(db,String(archive.source_entity_id));
   const purpose=db.prepare('SELECT body FROM app_settings WHERE name=?').get('contract_purpose:'+archive.source_entity_id);
   const itemId=lot.sourceKey.startsWith('contract-purchase:')?lot.sourceKey.split(':').at(-1):undefined;
   const candidates=(contract.items??[]).filter(item=>item.direction==='incoming'&&item.type_id===lot.typeId&&item.quantity===lot.quantity&&(!itemId||item.record_id===itemId));
   if(!binding?.active||binding.component!=='item_purchase'||!currentWalletBinding(binding,String(receipt.source_character_id),JSON.parse(String(receipt.body)),JSON.parse(String(archive.body)),db)||!contract.completed||contract.direction!=='incoming'||candidates.length!==1||Date.parse(contract.dateCompleted??'')!==Date.parse(lot.acquiredAt)||purpose&&JSON.parse(String(purpose.body)).management?.active===false)return {...segment,category:null,quality:'conflict',costCents:null};
  }else if(lot.evidence.some(key=>key.startsWith('esi:')))return {...segment,category:null,quality:'conflict',costCents:null};
 }
 for(const parent of lot.lineage??[]){const checked=currentConsumedOrigin(db,{...segment,lotId:parent.lotId},new Set(visited));if(checked.quality==='conflict')return {...segment,category:null,quality:'conflict',costCents:null};}
 return segment;
}
