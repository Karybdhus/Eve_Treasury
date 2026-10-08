import {NextResponse,type NextRequest} from 'next/server';
import {accessMode,assertApplicationRequest} from './lib/application-access';

export function proxy(request:NextRequest){
 try{
  assertApplicationRequest(request,!['GET','HEAD','OPTIONS'].includes(request.method));
  const response=NextResponse.next();
  if(accessMode()==='private'){
   response.headers.set('Cache-Control','private, no-store');
   response.headers.set('Referrer-Policy','same-origin');
   response.headers.set('X-Content-Type-Options','nosniff');
   response.headers.set('X-Frame-Options','DENY');
  }
  return response;
 }catch(error){
  const authentication=error instanceof Error&&error.message==='Application authentication required';
  const headers:Record<string,string>={'Cache-Control':'no-store'};
  if(authentication)headers['WWW-Authenticate']='Basic realm="Dashboard", charset="UTF-8"';
  return new NextResponse('Application access denied',{status:authentication?401:403,headers});
 }
}
export const config={matcher:'/:path*'};
