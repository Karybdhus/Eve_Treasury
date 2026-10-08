import {assertLocalRequest} from '@/lib/esi/config';
import {getDatabase} from '@/lib/db';
import {importMotorCsv} from '@/lib/motor-import';
export const runtime='nodejs';
export async function POST(request:Request){try{assertLocalRequest(request,true);}catch{return Response.json({error:'Local origin required'},{status:403});}if(Number(request.headers.get('content-length')??0)>2000000)return Response.json({error:'CSV too large'},{status:413});const db=getDatabase();try{const text=await request.text(),filename=decodeURIComponent(request.headers.get('x-filename')??'motor-import.csv').replace(/[^a-zA-Z0-9._-]/g,'_');return Response.json(importMotorCsv(db,text,filename));}catch(e){return Response.json({error:e instanceof Error?e.message:'Invalid CSV'},{status:400});}finally{db.close();}}
