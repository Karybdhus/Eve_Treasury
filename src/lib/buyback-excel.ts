import ExcelJS from 'exceljs';
import type {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {type Booking,listBuybacks,categories} from './buyback';
import {canonical,cents,decimal,totalMoney} from './money';
export type Control={location:string;label:string;category:string;reportedISK:string|null;calculatedISK:string|null;differenceISK:string|null;missingValues:number};
export type WorkbookImport={bookings:Booking[];controls:Control[]};
const columnCategories=['ratloot','ore_ice','hacking','salvage','pi'] as const;
function amount(cell:ExcelJS.Cell):string|null{
 const value=cell.value;const raw=value&&typeof value==='object'&&('formula' in value||'sharedFormula' in value)?('result' in value?value.result:undefined):value;
 if(raw==null||raw==='')return null;
 if(typeof raw!=='number'||!Number.isFinite(raw)||raw<0)throw new Error('Unsupported monetary value at '+cell.address);
 return canonical(raw.toFixed(2));
}
export async function parseBuybackWorkbook(bytes:Uint8Array):Promise<WorkbookImport>{
 const w=new ExcelJS.Workbook();await w.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof w.xlsx.load>[0]);
 const bookings:Booking[]=[],controls:Control[]=[];const now=new Date().toISOString();
 const addControl=(s:ExcelJS.Worksheet,row:number,col:number,label:string,category:string,subset:Booking[])=>{
  const values=subset.flatMap(b=>b.lines.filter(l=>l.category===category).map(l=>l.actualPayoutISK));const reported=amount(s.getCell(row,col)),calculated=totalMoney(values);controls.push({location:s.name+'!'+s.getCell(row,col).address,label,category,reportedISK:reported,calculatedISK:calculated,differenceISK:reported!==null&&calculated!==null?decimal(cents(reported)-cents(calculated)):null,missingValues:values.filter(v=>v===null).length});
 };
 for(const year of [2025,2026]){
  const s=w.getWorksheet('EVE Buyback '+year);if(!s)throw new Error('Missing EVE Buyback '+year+' worksheet');
  if(s.getCell('E6').text!=='Ratloot'||s.getCell('F6').text!=='ORE/ICE'||s.getCell('I6').text!=='PI')throw new Error('Unsupported workbook layout');
  for(let row=7;row<=s.rowCount;row++){
   const v=s.getCell(row,2).value;if(!(v instanceof Date))continue;
   const start=v.toISOString().slice(0,10);const end=new Date(v);end.setUTCDate(end.getUTCDate()+6);
   const lines=columnCategories.map((category,i)=>({category,actualPayoutISK:amount(s.getCell(row,i+5)),janiceValueISK:null,operatingCostsISK:null}));
   // Preserve blank weeks and explicit zero values without inventing payouts.
   bookings.push({bookingId:randomUUID(),weekStart:start,weekEnd:end.toISOString().slice(0,10),reportingStatus:lines.some(l=>l.actualPayoutISK!==null)?'confirmed_payout':'not_reported',actualPayoutISK:totalMoney(lines.map(l=>l.actualPayoutISK)),payoutDate:null,lines,source:'import',reconciliationStatus:'unmatched',createdAt:now,updatedAt:now,revision:1,historicalAggregate:true,sourceKey:'eve-buyback-week:'+start,notes:'Historical weekly aggregate; payout date not reported; missing category values remain unknown.'});
  }
  const yearRows=bookings.filter(b=>b.weekStart.startsWith(String(year)));
  let preceding:Booking[]=[];
  for(let row=7;row<=s.rowCount;row++){
   const start=s.getCell(row,2).value;if(start instanceof Date){const b=yearRows.find(b=>b.weekStart===start.toISOString().slice(0,10));if(b)preceding.push(b);}
   const label=s.getCell(row,1).text;
   if(label.startsWith('Monatsabschluss')){for(let i=0;i<5;i++)addControl(s,row,i+5,label,columnCategories[i],preceding);preceding=[];}
   const side=s.getCell(row,13).text;
   if(side&&/20(25|26)/.test(side)&&row<=20){
    const monthNames=['Januar','Februar','Maerz','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];const ascii=side.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace('Marz','Maerz');
    const index=monthNames.findIndex(m=>ascii.startsWith(m));
    const subset=side.startsWith('Gesamt')?yearRows:index>=0?yearRows.filter(b=>b.weekStart.slice(5,7)===String(index+1).padStart(2,'0')):[];
    if(side.startsWith('Gesamt')||index>=0)for(let i=0;i<5;i++)addControl(s,row,i+14,side,columnCategories[i],subset);
   }
  }
 }
 const all=w.getWorksheet('Alltime');if(all)for(let row=2;row<=all.rowCount;row++){const year=String(all.getCell(row,1).value);if(['2025','2026'].includes(year))for(let i=0;i<5;i++)addControl(all,row,i+2,'Alltime '+year,columnCategories[i],bookings.filter(b=>b.weekStart.startsWith(year)));}
 if(!bookings.length||bookings.some(b=>!b.lines.every(l=>categories.includes(l.category))))throw new Error('No supported weekly data');
 return {bookings,controls};
}
export async function importBuybackWorkbook(db:DatabaseSync,bytes:Uint8Array,filename:string){
 if(bytes.length>5*1024*1024)throw new Error('Workbook limit is 5 MB');
 const parsed=await parseBuybackWorkbook(bytes),hash=createHash('sha256').update(bytes).digest('hex');
 if(db.prepare('SELECT hash FROM buyback_imports WHERE hash=?').get(hash))return {imported:0,skipped:parsed.bookings.length,controls:parsed.controls};
 const existing=listBuybacks(db);let imported=0,skipped=0;db.exec('BEGIN IMMEDIATE');
 try{
  for(const b of parsed.bookings){
   const prior=existing.find(x=>x.sourceKey===b.sourceKey);
   if(prior){if(!isDeepStrictEqual(prior.lines,b.lines))throw new Error('Historical week '+b.weekStart+' changed. Review corrections before importing.');skipped++;continue;}
   db.prepare('INSERT INTO buyback_bookings VALUES (?,?,?,?,?,?)').run(b.bookingId,b.weekStart,null,JSON.stringify(b),b.createdAt,b.updatedAt);imported++;
  }
  db.prepare('INSERT INTO buyback_imports VALUES (?,?,?,?,?,?)').run(hash,filename,new Date().toISOString(),Buffer.from(bytes),JSON.stringify(parsed.controls),JSON.stringify({imported,skipped}));
  db.exec('COMMIT');return {imported,skipped,controls:parsed.controls};
 }catch(e){db.exec('ROLLBACK');throw e;}
}
