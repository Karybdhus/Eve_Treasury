import {assertLocalRequest} from '@/lib/esi/config';
import {syncCharacter,safeError} from '@/lib/esi/sync';
import {disconnect} from '@/lib/esi/sso';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string;action:string}>}){
 try{
  assertLocalRequest(request,true);const {id,action}=await params;
  if(!/^\d+$/.test(id))return Response.json({error:'Invalid character ID'},{status:400});
  if(action==='sync')return Response.json(await syncCharacter(id));
  if(action==='disconnect'){disconnect(id);return Response.json({ok:true});}
  return Response.json({error:'Unknown action'},{status:404});
 }catch(e){return Response.json({error:safeError(e)},{status:400});}
}
