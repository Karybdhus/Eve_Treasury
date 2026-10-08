export const ESI_SCOPES={
  mining:'esi-industry.read_character_mining.v1',pi:'esi-planets.manage_planets.v1',
  wallet:'esi-wallet.read_character_wallet.v1',industry:'esi-industry.read_character_jobs.v1',
  market:'esi-markets.read_character_orders.v1'
} as const;
export function configuredScopes(){
 const scopes=(process.env.EVE_SSO_SCOPES??Object.values(ESI_SCOPES).join(' ')).split(/\s+/).filter(Boolean);
 if(scopes.some(s=>!Object.values(ESI_SCOPES).includes(s as typeof ESI_SCOPES[keyof typeof ESI_SCOPES])))throw new Error('Only the supported data scopes may be requested');
 return [...new Set(scopes)];
}
export function configIssues(){
 const errors:string[]=[];
 if(!process.env.EVE_CLIENT_ID)errors.push('EVE_CLIENT_ID fehlt');
 const key=process.env.TOKEN_ENCRYPTION_KEY??'';
 if(!/^[A-Za-z0-9+/]{43}=$/.test(key)||Buffer.from(key,'base64').length!==32)errors.push('TOKEN_ENCRYPTION_KEY: 32 Bytes als Base64 erforderlich');
 if((process.env.APPLICATION_SECRET??'').length<32)errors.push('APPLICATION_SECRET: mindestens 32 Zeichen erforderlich');
 try{
  const url=new URL(process.env.EVE_CALLBACK_URL??'');
  if(!['127.0.0.1','localhost'].includes(url.hostname)||url.protocol!=='http:'||url.pathname!=='/api/auth/eve/callback'||url.search||url.hash)errors.push('EVE_CALLBACK_URL muss die lokale HTTP-Callback-URL sein');
 }catch{errors.push('EVE_CALLBACK_URL fehlt oder ist ungueltig');}
 if(!/^\d{4}-\d{2}-\d{2}$/.test(process.env.ESI_COMPATIBILITY_DATE??'2026-08-18'))errors.push('ESI_COMPATIBILITY_DATE ungueltig');
 try{configuredScopes();}catch{errors.push('EVE_SSO_SCOPES enthaelt nicht unterstuetzte Scopes');}
 return errors;
}
export function ssoConfig(){
 const errors=configIssues();if(errors.length)throw new Error(errors.join('; '));
 return {clientId:process.env.EVE_CLIENT_ID!,clientSecret:process.env.EVE_CLIENT_SECRET,callbackUrl:process.env.EVE_CALLBACK_URL!,appSecret:process.env.APPLICATION_SECRET!,encryptionKey:Buffer.from(process.env.TOKEN_ENCRYPTION_KEY!,'base64'),scopes:configuredScopes()};
}
export function appOrigin(){try{const u=new URL(process.env.EVE_CALLBACK_URL??'http://127.0.0.1:3000/api/auth/eve/callback');if(['127.0.0.1','localhost'].includes(u.hostname)&&u.protocol==='http:')return u.origin;}catch{}return 'http://127.0.0.1:3000';}
export function assertLocalRequest(request:Request,mutation=false){
 const url=new URL(request.url),expected=new URL(appOrigin());
 const host=request.headers.get('host')??url.host;
 if(host!==expected.host||!['127.0.0.1','localhost'].includes(url.hostname))throw new Error('Use the configured local application origin');
 if(mutation&&request.headers.get('origin')!==appOrigin())throw new Error('Same-origin browser request required');
 const site=request.headers.get('sec-fetch-site');
 if(mutation&&site==='cross-site')throw new Error('Cross-site request rejected');
}
