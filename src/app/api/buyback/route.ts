import {assertLocalRequest} from '@/lib/esi/config';
import {getDatabase} from '@/lib/db';
import {saveBuyback,cancelBuyback,linkBuybackWallet,unlinkBuybackWallet} from '@/lib/buyback';
import {importBuybackWorkbook} from '@/lib/buyback-excel';
export const runtime='nodejs';
export async function POST(request:Request){
 try{assertLocalRequest(request,true);}catch{return Response.json({error:'Local origin required'},{status:403});}
 if(Number(request.headers.get('content-length')??0)>6*1024*1024)return Response.json({error:'Import too large'},{status:413});
 const db=getDatabase();
 try{
  if(request.headers.get('content-type')?.includes('multipart/form-data')){const form=await request.formData(),file=form.get('file');if(!(file instanceof File)||!file.name.endsWith('.xlsx'))throw new Error('Select an XLSX file');return Response.json(await importBuybackWorkbook(db,new Uint8Array(await file.arrayBuffer()),file.name));}
  const text=await request.text();if(text.length>100000)throw new Error('Input too large');const input=JSON.parse(text);
  if(input.action==='cancel')return Response.json(cancelBuyback(db,input.bookingId,input.revision));
  if(input.action==='link'){linkBuybackWallet(db,input.bookingId,input.journalKey);return Response.json({ok:true});}
  if(input.action==='unlink'){unlinkBuybackWallet(db,input.bookingId);return Response.json({ok:true});}
  if(input.action==='save')return Response.json(saveBuyback(db,input.booking));
  throw new Error('Unknown action');
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Buyback failed'},{status:400});}finally{db.close();}
}
