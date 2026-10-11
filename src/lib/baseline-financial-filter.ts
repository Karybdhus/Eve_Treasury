import type {DatabaseSync} from 'node:sqlite';
import {financialFilter} from './financial-filter';
import {dateKey} from './time';
export function baselineFinancialFilter(db:DatabaseSync,input:Record<string,unknown>){
 const filter=financialFilter(input);if(input.from||input.baselineId)return filter;
 const row=db.prepare("SELECT id,created_at FROM economic_baselines WHERE id=(SELECT json_extract(body,'$.id') FROM app_settings WHERE name='economic_comparison') OR kind='opening' ORDER BY CASE WHEN kind='comparison' THEN 0 ELSE 1 END LIMIT 1").get();
 return row?{...filter,from:dateKey(String(row.created_at)),baselineId:String(row.id)}:filter;
}
export function sourceAfterBaseline(source:{date:string|null;raw:unknown},cutover:string){
 const raw=source.raw as Record<string,unknown>|null;const period=raw?.period as {from?:string}|undefined;const timestamp=[raw?.date,raw?.date_completed,raw?.completed_at,raw?.payoutDate,period?.from].find(value=>typeof value==='string'&&value.includes('T')&&Number.isFinite(Date.parse(value)));
 if(timestamp)return Date.parse(String(timestamp))>Date.parse(cutover);
 // A day-only receipt in the cutover day cannot prove a post-cutover payment.
 return source.date!==null&&source.date>dateKey(cutover);
}
