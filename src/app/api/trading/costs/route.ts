import {getDatabase} from '@/lib/db';
import {financialReadModel} from '@/lib/financial-read-model';
import {consolidatedFinancials} from '@/lib/reconciliation';
import {financialFilter} from '@/lib/financial-filter';
import {assertApplicationRequest} from '@/lib/application-access';
import {displayMoney} from '@/lib/money';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const escape=(v:unknown)=>String(v??'unbekannt').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function GET(request:Request){
 try{
  assertApplicationRequest(request);
  const u=new URL(request.url),page=Number(u.searchParams.get('page')??0);
  if(!Number.isSafeInteger(page)||page<0||page>100000)throw new Error('Invalid page');
  u.searchParams.delete('page');
  const filter=financialFilter(Object.fromEntries(u.searchParams)),db=getDatabase();
  try{
   const result=consolidatedFinancials(db,filter,financialReadModel(db)).trading;
   const characters=new Map((db.prepare('SELECT character_id,name FROM characters').all() as {character_id:string;name:string}[]).map(c=>[c.character_id,c.name]));
   const rows=result.details.slice(page*100,(page+1)*100).map(d=>`<tr><td>${escape(d.date)}</td><td>${escape(characters.get(d.characterId??'')??'Unbekannter Charakter')}</td><td>${escape(d.kind==='broker_fee'?'Brokergebuehr':d.kind==='sales_tax'?'Verkaufssteuer':'Weitere Handelskosten')}</td><td>${escape(displayMoney(d.amountISK))}</td><td>${escape(displayMoney(d.alreadyIncludedISK))}</td><td>${escape(displayMoney(d.effectiveCostISK))}</td><td>${escape(d.quality)}</td><td>${escape(d.sourceKeys.join(', '))}</td></tr>`).join('');
   const pageLink=(n:number)=>{const params=new URLSearchParams(u.searchParams);params.set('page',String(n));return escape(u.pathname+'?'+params);};
   const navigation=(page>0?`<a href="${pageLink(page-1)}">Vorherige Belege</a> `:'')+((page+1)*100<result.feeCount?`<a href="${pageLink(page+1)}">Weitere Belege</a>`:'');
   return new Response(`<!doctype html><html lang="de"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Trading-Kostenbelege</title><style>body{background:#0b1220;color:#e3eaf4;font:16px system-ui;padding:20px}table{border-collapse:collapse}td,th{padding:10px;border-bottom:1px solid #334155;text-align:left}main{overflow:auto}a{color:#8ed6ed}</style><h1>Trading-Kostenbelege</h1><p>${escape(filter.from)} bis ${escape(filter.to)}. ${result.feeCount} Ereignisse; Seite ${page+1}, maximal100 pro Seite. Fehlende Historie bleibt unbekannt.</p><p><a href="/trading">Zurueck zu Trading</a></p>${navigation}<main><table><thead><tr><th>Datum</th><th>Charakter</th><th>Art</th><th>Bezahlt</th><th>Bereits enthalten</th><th>Zusaetzliche Kosten</th><th>Nachweis</th><th>Quellreferenz</th></tr></thead><tbody>${rows}</tbody></table></main></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"}});
  }finally{db.close();}
 }catch{return new Response('Kostenbelege konnten nicht geladen werden',{status:400});}
}
