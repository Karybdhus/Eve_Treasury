import {NextResponse} from 'next/server';
import {assertLocalRequest,appOrigin} from '@/lib/esi/config';
import {beginAuthorization} from '@/lib/esi/sso';
import {stateCookie} from '@/lib/esi/crypto';
export const runtime='nodejs';
export async function POST(request:Request){
 try{
  assertLocalRequest(request,true);
  const form=await request.formData(),id=form.get('characterId');
  if(id&&!/^\d+$/.test(String(id)))throw new Error('Invalid character ID');
  const flow=beginAuthorization(id?String(id):undefined);
  const response=NextResponse.redirect(flow.url,303);
  response.cookies.set('eve_sso_state',stateCookie(flow.state),{httpOnly:true,sameSite:'lax',secure:false,path:'/api/auth/eve',maxAge:600});
  response.headers.set('Cache-Control','no-store');return response;
 }catch{return NextResponse.redirect(appOrigin()+'/characters?error=configuration_or_request',303);}
}
