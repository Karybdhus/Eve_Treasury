import type {DatabaseSync} from 'node:sqlite';
import {baselineList,baselineForCharacter} from './economic-baseline';
import {records} from './source-records';
import {transferOriginLots} from './inventory-continuity';
type Identity={itemId:string;owner:string;typeId:string;quantity:string;at:string;rawId:string|null};
// Only unchanged physical item identities prove an automatic cross-owner transfer.
export function processObservedTransfers(db:DatabaseSync,owners:string[]){
 const selected=new Set(owners.filter(owner=>baselineForCharacter(db,owner))),previous=new Map<string,Identity>();
 for(const baseline of baselineList(db).filter(b=>['opening','entry'].includes(b.kind)))for(const asset of baseline.assets)if(!previous.has(asset.itemId))previous.set(asset.itemId,{itemId:asset.itemId,owner:asset.owner,typeId:asset.typeId,quantity:asset.quantity,at:asset.observedAt,rawId:asset.rawId});
 for(const row of db.prepare("SELECT value FROM inventory_state WHERE name LIKE 'continuity-assets:%'").all())for(const asset of JSON.parse(String(row.value)) as Identity[])previous.set(asset.itemId,asset);
 const current=records(db).filter(r=>r.kind==='asset_snapshot'&&r.source==='esi'&&r.status==='actual'&&r.dataQuality!=='historical_seed'&&selected.has(r.sourceCharacterId??'')).map(r=>({itemId:String(r.data.item_id),owner:r.sourceCharacterId!,typeId:String(r.data.type_id),quantity:String(r.data.quantity),at:r.fetchedAt,rawId:r.rawId??null}));
 const counts=new Map<string,number>();for(const item of current)counts.set(item.itemId,(counts.get(item.itemId)??0)+1);const duplicates=new Set([...counts].filter(([,count])=>count>1).map(([id])=>id));let transferred=0;
 db.exec('BEGIN IMMEDIATE');try{for(const item of current){const old=previous.get(item.itemId);if(!old||old.owner===item.owner||!selected.has(old.owner)||duplicates.has(item.itemId)||old.typeId!==item.typeId||old.quantity!==item.quantity||!/^[1-9][0-9]*$/.test(item.quantity)||Date.parse(item.at)<Date.parse(old.at))continue;
  transferOriginLots(db,{sourceKey:'observed-transfer:'+item.itemId+':'+old.owner+':'+item.owner+':'+old.rawId+':'+item.rawId,fromOwner:old.owner,toOwner:item.owner,typeId:item.typeId,quantity:item.quantity,at:item.at,evidence:['physical-item:'+item.itemId,...[old.rawId,item.rawId].filter((id):id is string=>id!==null)]});transferred++;
 }
 for(const owner of selected)db.prepare('INSERT INTO inventory_state VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value').run('continuity-assets:'+owner,JSON.stringify(current.filter(i=>i.owner===owner&&!duplicates.has(i.itemId))));db.exec('COMMIT');return {transferred,conflictingItems:duplicates.size};
 }catch(e){db.exec('ROLLBACK');throw e;}
}
