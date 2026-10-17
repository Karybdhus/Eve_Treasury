import {signedCents} from './exact-money';
export function paidIncludingPending(paid:string|null,pending:string|null){
 if(paid===null||pending===null)return 'Unbekannt';const a=signedCents(paid),b=signedCents(pending),total=a+b,max=total<0n?-total:total;
 const [divisor,unit]=max>=100000000000n?[100000000000n,'Mrd ISK']:max>=100000000n?[100000000n,'Mio ISK']:[100n,'ISK'];
 const show=(v:bigint)=>new Intl.NumberFormat('de-DE',{maximumFractionDigits:2}).format(Number(v)/Number(divisor));return show(a)+(b>0n?' ('+show(total)+')':'')+' '+unit;
}
