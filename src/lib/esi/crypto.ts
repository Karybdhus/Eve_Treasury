import {createCipheriv,createDecipheriv,randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {ssoConfig} from './config';
export function encrypt(value:string,context:string,key=ssoConfig().encryptionKey){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(context));
 const body=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),body.toString('base64url')].join('.');
}
export function decrypt(value:string,context:string,key=ssoConfig().encryptionKey){
 const [version,iv,tag,body]=value.split('.');if(version!=='v1')throw new Error('Unsupported encrypted credential format');
 const cipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));
 cipher.setAAD(Buffer.from(context));cipher.setAuthTag(Buffer.from(tag,'base64url'));
 return Buffer.concat([cipher.update(Buffer.from(body,'base64url')),cipher.final()]).toString('utf8');
}
export function stateCookie(state:string,secret=ssoConfig().appSecret){return state+'.'+createHmac('sha256',secret).update(state).digest('base64url');}
export function verifyStateCookie(state:string,cookie:string,secret=ssoConfig().appSecret){
 const expected=Buffer.from(stateCookie(state,secret)),actual=Buffer.from(cookie);
 return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
