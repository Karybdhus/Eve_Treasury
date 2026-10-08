import {assertLocalRequest} from '@/lib/esi/config';
import {startSession,endSession} from '@/lib/manual-sessions';
export const runtime='nodejs';
export async function POST(request:Request){
 try{
  assertLocalRequest(request,true);
  const input=await request.json();
  if(input.action==='end'){endSession(input.sessionId);return Response.json({ok:true});}
  return Response.json({sessionId:startSession(input)});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Session failed'},{status:400});}
}
