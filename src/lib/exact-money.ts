import {parse} from 'lossless-json';
import {decimal} from './money';
export type MoneyFact={value:string|null;quality:'exact'|'legacy_numeric'|'precision_unknown'|'unknown'};
export function signedCents(value:string):bigint {
 if(!/^-?(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(value))throw new Error('Invalid exact monetary decimal');
 const negative=value.startsWith('-'),text=negative?value.slice(1):value;
 const [whole,fraction='']=text.split('.');
 return (negative?-1n:1n)*(BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0')));
}
export function moneyFact(input:unknown):MoneyFact {
 if(typeof input==='string'){const token=monetaryToken(input);if(token!==null)input=token;}
 if(typeof input==='string'&&/^-?(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(input))return {value:decimal(signedCents(input)),quality:'exact'};
 if(typeof input==='number'&&Number.isFinite(input)){
  const text=String(input);
  if(/^-?(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(text)&&Number.isSafeInteger(Number(signedCents(text)))&&Math.abs(input)<10000000000000)return {value:decimal(signedCents(text)),quality:'legacy_numeric'};
  return {value:null,quality:'precision_unknown'};
 }
 return {value:null,quality:'unknown'};
}
export function exactJson(text:string):unknown{return parse(text,null,token=>token);}
export function exactSum(values:(string|null|undefined)[]):string|null{return values.length&&values.every(v=>v!=null)?decimal(values.reduce((s,v)=>s+signedCents(v!),0n)):null;}
export function exactDifference(revenue:string|null,costs:(string|null|undefined)[]):string|null{
 const cost=exactSum(costs);return revenue!==null&&cost!==null?decimal(signedCents(revenue)-signedCents(cost)):null;
}
export function roundedRatio(numerator:bigint,denominator:bigint):bigint {
 if(denominator<=0n)throw new Error('Positive denominator required');
 const negative=numerator<0n,value=negative?-numerator:numerator;
 return (negative?-1n:1n)*((value+denominator/2n)/denominator);
}
export function compatibilityNumber(value:string|null):number|'unknown'{
 if(value===null)return 'unknown';const n=Number(value);
 return moneyFact(n).value===value?n:'unknown';
}

export function monetaryToken(token:string):string|null {
 const m=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
 if(!m)return null;
 const exponent=Number(m[4]??0);if(!Number.isSafeInteger(exponent)||Math.abs(exponent)>100)return null;
 let digits=m[2]+(m[3]??''),point=m[2].length+exponent;
 if(point<=0){digits='0'.repeat(-point+1)+digits;point=1;}
 if(point>=digits.length)digits=digits+'0'.repeat(point-digits.length);
 const whole=(digits.slice(0,point)||'0').replace(/^0+(?=\d)/,''),fraction=digits.slice(point).replace(/0+$/,'');
 if(fraction.length>2)return null;
 return (m[1]&&!(whole==='0'&&!fraction)?'-':'')+whole+(fraction?'.'+fraction:'');
}
