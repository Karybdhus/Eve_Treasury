import type {DatabaseSync} from 'node:sqlite';
import {marketOriginProjection} from './inventory-market-sales';
import {effectiveContractSplit} from './contract-split-state';
import {staticNames} from './names';
import {decimal} from './money';
import type {ConsumedLot} from './inventory-continuity';
const labels:Record<string,string>={OPENING_STOCK:'Erfasstes Anfangsinventar',MARKET_PURCHASE:'Nachgewiesener Market-Kauf',CONTRACT_PURCHASE:'Nachgewiesener Contract-Kauf',MINING:'Mining-Ledger',PI:'Eigene PI-Produktion',SALVAGE:'Salvage',HACKING:'Hacking',LOOT:'Loot',INDUSTRY:'Weiterverarbeitung / Industry',UNKNOWN:'Herkunft offen'};
export function incomeOriginDetails(db:DatabaseSync,keys:string[]){
 const catalog=staticNames();const describe=(segment:ConsumedLot)=>{const lot=db.prepare('SELECT type_id FROM inventory_origin_lots WHERE id=?').get(segment.lotId);const metadata=lot?db.prepare("SELECT json_extract(body,'$.name') name FROM project_records WHERE kind='type_metadata' AND source_entity_id=? AND is_current=1 LIMIT 1").get(lot.type_id):null;return {item:lot?catalog?.types[String(lot.type_id)]?.name??String(metadata?.name??'Name noch nicht verfuegbar'):'Ungeklaerter Gegenstand',origin:labels[segment.origin]??segment.origin,quantity:segment.quantity,costISK:segment.costCents===null?null:decimal(BigInt(segment.costCents)),quality:segment.quality,ruleVersion:segment.ruleVersion,evidenceCount:segment.evidence.length};};
 const market=marketOriginProjection(db,keys);if(market)return market.lines.map(describe);
 const splits=keys.map(key=>effectiveContractSplit(db,key)).filter(s=>s!==null);if(splits.length!==1)return [];
 const rows=db.prepare("SELECT body FROM inventory_origin_movements WHERE source_key LIKE ? ORDER BY source_key").all('contract-sale:'+splits[0].contractId+':%');return rows.flatMap(row=>(JSON.parse(String(row.body)).segments as ConsumedLot[]).map(describe));
}
