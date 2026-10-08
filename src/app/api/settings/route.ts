import {assertLocalRequest} from '@/lib/esi/config';
import {getDatabase} from '@/lib/db';
import {saveSettings} from '@/lib/settings';
export const runtime='nodejs';
export async function POST(request:Request){try{assertLocalRequest(request,true);}catch{return Response.json({error:'Local origin required'},{status:403});}const db=getDatabase();try{const text=await request.text();if(text.length>10000)throw new Error('Settings too large');return Response.json(saveSettings(db,JSON.parse(text)));}catch(e){return Response.json({error:e instanceof Error?e.message:'Invalid settings'},{status:400});}finally{db.close();}}
