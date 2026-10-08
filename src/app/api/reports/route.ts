import {assertLocalRequest} from '@/lib/esi/config';
import { getDatabase, importReports, readReports } from '@/lib/db';
function safeFilename(name:string|null){try{return decodeURIComponent(name??'api-import.json');}catch{return name??'api-import.json';}}
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){ const db=getDatabase();try{return Response.json(readReports(db));}finally{db.close();} }
export async function POST(request:Request){
  try{assertLocalRequest(request,true);}catch{return Response.json({error:'Same-origin local import required'},{status:403});}
  if(Number(request.headers.get('content-length')??0)>2_000_000)return Response.json({error:'Maximum import size is 2 MB'},{status:413});
  try{
    const raw=await request.text();if(Buffer.byteLength(raw)>2_000_000) return Response.json({error:'Maximum import size is 2 MB'},{status:413});
    const db=getDatabase();try{return Response.json(importReports(db,JSON.parse(raw),safeFilename(request.headers.get('x-filename'))));}finally{db.close();}
  }catch(e){return Response.json({error:(e as Error).message},{status:400});}
}
