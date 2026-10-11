import {assertLocalRequest} from '@/lib/esi/config';
import {safeError} from '@/lib/esi/sync';
import {after} from 'next/server';
import {getDatabase} from '@/lib/db';
import {acquireSync,executeSync} from '@/lib/esi/coordinator';
import {disconnect} from '@/lib/esi/sso';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string;action:string}>}){
 try{
  assertLocalRequest(request,true);const {id,action}=await params;
  if(!/^\d+$/.test(id))return Response.json({error:'Invalid character ID'},{status:400});
  if(action==='sync'){if(!['127.0.0.1','localhost'].includes(new URL(request.url).hostname))return Response.json({error:'Local sync access required'},{status:403});const db=getDatabase();let start;try{start=acquireSync(db,id);}finally{db.close();}if(start.started)after(async()=>{await executeSync(start.job);});return Response.json({runId:start.job.id,started:start.started,results:{coordinator:{status:start.started?'running':'already_running'}}},{status:start.started?202:200});}
  if(action==='disconnect'){disconnect(id);return Response.json({ok:true});}
  return Response.json({error:'Unknown action'},{status:404});
 }catch(e){return Response.json({error:safeError(e)},{status:400});}
}
