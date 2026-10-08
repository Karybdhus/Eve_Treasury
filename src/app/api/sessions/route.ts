import {getDatabase} from '@/lib/db';
import {linkSessionIncome} from '@/lib/session-income';
import {assertLocalRequest} from '@/lib/esi/config';
import {startSession,endSession} from '@/lib/manual-sessions';
export const runtime='nodejs';
export async function POST(request:Request){
 try{
  assertLocalRequest(request,true);
  const text=await request.text();if(text.length>20000)throw new Error('Input too large');const input=JSON.parse(text);
  if(input.action==='link'||input.action==='unlink'){const db=getDatabase();try{if(input.action==='link')linkSessionIncome(db,input.sessionId,input.bookingId,input.confirmExclusive);else{if(typeof input.linkKey!=='string')throw new Error('Invalid link');db.prepare("UPDATE project_records SET is_current=0 WHERE deduplication_key=? AND kind='session_buyback_link' AND source='manual'").run(input.linkKey);}return Response.json({ok:true});}finally{db.close();}}
  if(input.action==='end'){endSession(input.sessionId);return Response.json({ok:true});}
  return Response.json({sessionId:startSession(input)});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Session failed'},{status:400});}
}
