import type {DatabaseSync} from 'node:sqlite';import {signedCents,moneyFact} from './exact-money';import {decimal} from './money';import type {PriceEvidence} from './economic-baseline';
// Saved quotes are valuation evidence; purchase prices and scenarios are not market quotes.
export function savedAssetPrices(db:DatabaseSync,now=new Date().toISOString()):PriceEvidence[]{
 const candidates=new Map<string,PriceEvidence[]>();const rows=db.prepare("SELECT body FROM app_settings WHERE name LIKE 'contract_valuation:%' ORDER BY updated_at DESC").all() as {body:string}[];
 for(const row of rows){const value=JSON.parse(row.body) as {source:string;valuedAt:string;lines:{typeId:string;quantity:string;valueISK:string|null;source?:string;valuedAt?:string}[]};
  for(const line of value.lines??[]){const source=line.source??value.source,at=line.valuedAt??value.valuedAt;if(!['manual','janice_import','janice_api'].includes(source)||!Number.isFinite(Date.parse(at))||Date.parse(at)>Date.parse(now)||Date.parse(now)-Date.parse(at)>86400000||!/^[1-9][0-9]*$/.test(line.quantity))continue;
   const amount=moneyFact(line.valueISK).value;if(amount===null||signedCents(amount)<0n)continue;const cents=signedCents(amount),quantity=BigInt(line.quantity);if(cents%quantity!==0n)continue;
   const quote={typeId:line.typeId,unitISK:decimal(cents/quantity),observedAt:at,source:source+':saved_exact_unit_quote'};candidates.set(line.typeId,[...(candidates.get(line.typeId)??[]),quote]);
  }
 }
 return [...candidates.values()].flatMap(list=>{const at=list.map(p=>p.observedAt).sort().at(-1)!;const latest=list.filter(p=>p.observedAt===at);return new Set(latest.map(p=>p.unitISK)).size===1?[latest[0]]:[];}).sort((a,b)=>a.typeId<b.typeId?-1:a.typeId>b.typeId?1:0);
}