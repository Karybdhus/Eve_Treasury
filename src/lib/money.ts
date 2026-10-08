import {z} from 'zod';
// Canonical decimal strings and integer cents keep storage and aggregation exact.
export const Money=z.string().regex(/^(0|[1-9][0-9]{0,13})(\.[0-9]{1,2})?$/,'Use a non-negative ISK amount with at most two decimal places');
export function cents(value:string):bigint{Money.parse(value);const [whole,fraction='']=value.split('.');return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));}
export function decimal(value:bigint):string{const sign=value<0n?'-':'';const n=value<0n?-value:value;return sign+(n/100n).toString()+'.'+(n%100n).toString().padStart(2,'0');}
export function canonical(value:string){return decimal(cents(value));}
export function totalMoney(values:(string|null|undefined)[]):string|null{if(!values.length||values.some(v=>v==null))return null;return decimal(values.reduce<bigint>((n,v)=>n+cents(v!),0n));}
export function displayMoney(value:string|null|undefined){if(value==null)return 'Nicht gemeldet';const negative=value.startsWith('-'),raw=negative?value.slice(1):value;const [whole,fraction='']=raw.split('.');return (negative?'-':'')+new Intl.NumberFormat('de-DE').format(BigInt(whole))+','+fraction.padEnd(2,'0')+' ISK';}
