import type {DatabaseSync} from 'node:sqlite';
import {exactJson,moneyFact,exactSum} from './exact-money';
import {dateKey} from './time';
export function walletObservations(db:DatabaseSync,characterIds:string[],filter:{from:string;to:string}){
 const selected=new Set(characterIds),points=new Map<string,Map<string,{at:string;value:string|null}>>();
 const rows=db.prepare("SELECT character_id,fetched_at,payload_text FROM raw_source_records WHERE source='esi' AND endpoint LIKE '/characters/%/wallet' ORDER BY fetched_at").all() as {character_id:string;fetched_at:string;payload_text:string}[];
 for(const row of rows){if(!selected.has(row.character_id)||row.fetched_at>new Date().toISOString())continue;const day=dateKey(row.fetched_at);if(day<filter.from||day>filter.to)continue;const byCharacter=points.get(day)??new Map();const raw=exactJson(row.payload_text);const value=moneyFact(typeof raw==='object'&&raw!==null?(raw as {wallet:unknown}).wallet:raw).value;byCharacter.set(row.character_id,{at:row.fetched_at,value});points.set(day,byCharacter);}
 const trajectory=[...points].map(([day,values])=>({day,amountISK:values.size===selected.size?exactSum([...values.values()].map(v=>v.value)):null,observed:values.size,expected:selected.size,from:[...values.values()].map(v=>v.at).sort()[0],to:[...values.values()].map(v=>v.at).sort().at(-1)!}));
 return {trajectory,policy:'Observed daily snapshots only; a global point requires every selected character on the same day. Observation window is shown; no back-calculation or forward-fill.'};
}