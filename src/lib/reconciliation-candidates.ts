import type {FinancialSource} from './reconciliation';
import {signedCents} from './exact-money';

export function reconciliationCandidates(sources:FinancialSource[],walletLinks:{journal_key:string;booking_id:string}[]){
 const tokens=new Map<string,number[]>(),identities=new Map<string,number[]>(),amountDays=new Map<string,number[]>();
 const pairs=new Map<string,[number,number]>();
 const add=(a:number,b:number)=>{if(a===b)return;const i=Math.min(a,b),j=Math.max(a,b);pairs.set(i+':'+j,[i,j]);};
 const index=(map:Map<string,number[]>,key:string,i:number)=>{const group=map.get(key)??[];group.push(i);map.set(key,group);};
 for(let i=0;i<sources.length;i++){
  const s=sources[i];if(!s.eligible)continue;
  for(const token of new Set([s.key,s.sourceId,s.identity??'']))index(tokens,token,i);
  if(s.identity!==null)index(identities,s.identity,i);
  if(s.amountISK!==null&&s.date!==null&&signedCents(s.amountISK)>0n)index(amountDays,s.date+'|'+s.amountISK,i);
 }
 for(const map of [identities,amountDays])for(const group of map.values())for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++)add(group[i],group[j]);
 for(let i=0;i<sources.length;i++)if(sources[i].eligible)for(const reference of sources[i].references)for(const j of tokens.get(reference)??[])add(i,j);
 for(const link of walletLinks)for(const i of tokens.get(link.journal_key)??[])for(const j of tokens.get('buyback:'+link.booking_id)??[])add(i,j);
 return [...pairs.values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
}
