import {NextRequest,NextResponse} from 'next/server';
import {appOrigin,assertLocalRequest} from '@/lib/esi/config';
import {verifyStateCookie} from '@/lib/esi/crypto';
import {completeAuthorization} from '@/lib/esi/sso';
export const runtime='nodejs';
export async function GET(request:NextRequest){
 let result='connected';
 try{
  assertLocalRequest(request);
  const params=request.nextUrl.searchParams,state=params.get('state'),code=params.get('code');
  const cookie=request.cookies.get('eve_sso_state')?.value;
  if(params.has('error')||!state||!code||!cookie||!verifyStateCookie(state,cookie))throw new Error('Invalid SSO callback');
  await completeAuthorization(state,code);
 }catch{result='sso_failed';}
 const response=NextResponse.redirect(appOrigin()+'/characters?'+(result==='connected'?'notice=':'error=')+result,303);
 response.cookies.set('eve_sso_state','',{httpOnly:true,sameSite:'lax',secure:appOrigin().startsWith('https:'),path:'/api/auth/eve',maxAge:0});
 response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');return response;
}
