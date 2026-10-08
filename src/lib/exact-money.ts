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
