import {z} from 'zod';
import type {DatabaseSync} from 'node:sqlite';
import {isDeepStrictEqual} from 'node:util';
import {Money,cents,decimal,totalMoney} from './money';
import {storeRaw,storeRecord,records,type ProjectRecord} from './source-records';
import {dateKey} from './time';
import {project} from './accounting';
// Dashboard exchange contract, not an undocumented native Motor Market export.
const missing=(v:unknown)=>v===''||v==='unknown'||v==='not_reported'||v==null?null:v;
const amount=z.preprocess(missing,Money.nullable());
const Row=z.object({source_id:z.string().regex(/^[A-Za-z0-9:_-]{1,200}$/),character_id:z.string().regex(/^\d+$/),source_transaction_id:z.preprocess(missing,z.string().regex(/^\d+$/).nullable()),timestamp:z.iso.datetime({offset:true}),type_id:z.string().regex(/^\d+$/),side:z.enum(['buy','sell']),quantity:z.string().regex(/^[1-9]\d*$/).transform(Number).refine(Number.isSafeInteger,'Quantity too large'),unit_price_isk:Money,cost_basis_isk:amount,cost_basis_reference:z.preprocess(missing,z.string().max(1000).nullable()),broker_fees_isk:amount,sales_tax_isk:amount,relist_costs_isk:amount,operating_costs_isk:amount,goods_origin:z.enum(['purchased','self_earned','legacy','unknown']),status:z.enum(['actual','plan','estimate'])}).strict().refine(r=>[r.cost_basis_isk,r.broker_fees_isk,r.sales_tax_isk,r.relist_costs_isk,r.operating_costs_isk].reduce<bigint>((n,v)=>n+(v===null?0n:cents(v)),0n)<=9000000000000000n,'Combined costs exceed supported value');
export function parseCsv(text:string):Record<string,string>[]{
 text=text.replace(/^\uFEFF/,'');const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,afterQuote=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(quoted){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;afterQuote=true;}}else cell+=ch;continue;}if(ch==='"'){if(cell||afterQuote)throw new Error('Invalid CSV quote');quoted=true;}else if(ch===','){row.push(cell);cell='';afterQuote=false;}else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v!==''))rows.push(row);row=[];cell='';afterQuote=false;}else{if(afterQuote&&!/\s/.test(ch))throw new Error('Unexpected text after CSV quote');if(!afterQuote)cell+=ch;}}
 if(quoted)throw new Error('Unclosed CSV quote');row.push(cell);if(row.some(v=>v!==''))rows.push(row);
 if(rows.length<2||rows.length>501)throw new Error('CSV requires a header and 1 to 500 rows');
 const headers=rows.shift()!;if(new Set(headers).size!==headers.length)throw new Error('Duplicate CSV header');
 return rows.map((values,i)=>{if(values.length!==headers.length)throw new Error('CSV row '+(i+2)+' has wrong column count');return Object.fromEntries(headers.map((h,j)=>[h,values[j]]));});
}
export function importMotorCsv(db:DatabaseSync,text:string,filename:string){
 if(Buffer.byteLength(text)>2000000)throw new Error('CSV maximum is 2 MB');
 const parsed=parseCsv(text).map((raw,i)=>{try{const r=Row.parse(raw);if(r.status==='actual'&&Date.parse(r.timestamp)>Date.now())throw new Error('Actual transaction is in the future');const gross=cents(r.unit_price_isk)*BigInt(r.quantity);if(gross>9000000000000000n)throw new Error('Transaction exceeds supported value');return {...r,gross_isk:decimal(gross),canonical_id:r.source_transaction_id?'esi:'+r.character_id+':wallet_transaction:'+r.source_transaction_id:'motor:trade:'+r.source_id};}catch(e){throw new Error('CSV row '+(i+2)+': '+(e as Error).message);}});
 const now=new Date().toISOString();let imported=0,skipped=0;db.exec('BEGIN IMMEDIATE');
 try{const rawId=storeRaw(db,{source:'motor_market',endpoint:'motor-csv-import',entityId:filename,fetchedAt:now,payloadText:text});
  for(const input of parsed){const {source_id,...r}=input;const key='motor-ledger:'+r.canonical_id;const data={...r,external_source_id:r.source_transaction_id?undefined:source_id};const existing=db.prepare('SELECT body FROM project_records WHERE deduplication_key=?').get(key) as {body:string}|undefined;
   if(existing){if(!isDeepStrictEqual(JSON.parse(existing.body),JSON.parse(JSON.stringify(data))))throw new Error('Transaction identity changed: '+r.canonical_id);skipped++;continue;}
   storeRecord(db,{kind:'motor_trade',source:'motor_market',sourceClass:'automatic',sourceCharacterId:r.character_id,sourceEntityId:r.canonical_id,fetchedAt:now,sourceTimestamp:r.timestamp,status:r.status,dataQuality:'partial',deduplicationKey:key,data,rawId});imported++;
  }db.exec('COMMIT');return {imported,skipped};
 }catch(e){db.exec('ROLLBACK');throw e;}
}
export function motorAnalytics(db:DatabaseSync,enabled=true){
 const rows=enabled?records(db,'motor_trade'):[],projectRows=rows.filter(r=>r.status==='actual'&&dateKey(String(r.data.timestamp))>=project.start&&dateKey(String(r.data.timestamp))<=project.end);
 const sells=projectRows.filter(r=>r.data.side==='sell'&&r.data.goods_origin!=='legacy');
 const net=(r:ProjectRecord):string|null=>{const d=r.data;if(d.side!=='sell'||!['purchased','legacy'].includes(String(d.goods_origin))||!d.cost_basis_reference)return null;const costs=totalMoney([d.cost_basis_isk,d.broker_fees_isk,d.sales_tax_isk,d.relist_costs_isk,d.operating_costs_isk] as (string|null)[]);return costs===null?null:decimal(cents(String(d.gross_isk))-cents(costs));};
 // Ledger profits are an independent view. They are not added to agent daily totals.
 const known=sells.map(net).filter((v):v is string=>v!==null);const legacy=projectRows.filter(r=>r.data.side==='sell'&&r.data.goods_origin==='legacy');
 return {rows:rows.map(r=>({...r,netISK:r.status==='actual'?net(r):null})),revenueISK:totalMoney(sells.map(r=>String(r.data.gross_isk))),verifiedNetSubtotalISK:known.length?decimal(known.reduce((n,v)=>n+(v.startsWith('-')?-cents(v.slice(1)):cents(v)),0n)):null,missingCostBasis:sells.filter(r=>net(r)===null).length,legacyRevenueISK:totalMoney(legacy.map(r=>String(r.data.gross_isk))),label:'Motor transaction ledger; not additive with agent daily reports'};
}
