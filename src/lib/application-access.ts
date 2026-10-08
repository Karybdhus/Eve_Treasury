import {createHash,timingSafeEqual} from 'node:crypto';

type Environment = Record<string,string|undefined>;
export function accessMode(env:Environment=process.env){
 const mode=env.DASHBOARD_ACCESS_MODE??'local';
 if(mode!=='local'&&mode!=='private')throw new Error('Invalid DASHBOARD_ACCESS_MODE');
 return mode;
}
export function applicationOrigin(env:Environment=process.env){
 if(accessMode(env)==='private'){
  const url=new URL(env.DASHBOARD_PUBLIC_ORIGIN??'');
  if(url.protocol!=='https:'||!url.hostname.endsWith('.ts.net')||url.port||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Private mode requires an exact HTTPS tailnet origin');
  return url.origin;
 }
 const url=new URL(env.EVE_CALLBACK_URL??'http://127.0.0.1:3000/api/auth/eve/callback');
 if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.username||url.password)throw new Error('Local mode requires a loopback HTTP origin');
 return url.origin;
}
export function privateAccessConfig(env:Environment=process.env){
 const origin=applicationOrigin(env);
 const user=env.DASHBOARD_ACCESS_USER??'',password=env.DASHBOARD_ACCESS_PASSWORD??'';
 if(!/^[A-Za-z0-9._-]{1,64}$/.test(user)||password.length<32||password.length>256||/[\r\n:]/.test(password))throw new Error('Private mode requires a user and a separate password of 32 to 256 characters');
 return {origin,user,password};
}
function sameSecret(a:string,b:string){
 return timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
}
export function assertApplicationRequest(request:Request,mutation=false,env:Environment=process.env){
 const url=new URL(request.url),expected=new URL(applicationOrigin(env));
 const host=request.headers.get('host')??url.host;
 // Forwarded headers never select an origin or authenticate a user.
 if(host!==expected.host)throw new Error('Configured application host required');
 if(accessMode(env)==='local'&&!['127.0.0.1','localhost'].includes(url.hostname))throw new Error('Loopback request required');
 if(accessMode(env)==='private'){
  const {user,password}=privateAccessConfig(env),authorization=request.headers.get('authorization')??'';
  if(!/^Basic [A-Za-z0-9+/]+={0,2}$/.test(authorization)||authorization.length>1024)throw new Error('Application authentication required');
  const credentials=Buffer.from(authorization.slice(6),'base64').toString('utf8');
  if(!sameSecret(credentials,user+':'+password))throw new Error('Application authentication required');
 }
 if(mutation&&request.headers.get('origin')!==expected.origin)throw new Error('Same-origin browser request required');
 if(mutation&&request.headers.get('sec-fetch-site')==='cross-site')throw new Error('Cross-site request rejected');
}
