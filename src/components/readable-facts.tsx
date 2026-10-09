const labels:Record<string,string>={planetCount:'Kolonien',planets:'Kolonien',factorySlots:'Produktionsslots',industryJobs:'Industry-Jobs',reactionJobs:'Reaktionen',marketOrders:'Marktorders',salesTaxPercent:'Verkaufssteuer (%)',npcBrokerPercent:'NPC-Broker (%)',commandCenter:'Command Center',consolidation:'Interplanetary Consolidation',intelligence:'Intelligenz',perception:'Wahrnehmung',memory:'Gedaechtnis',willpower:'Willenskraft',charisma:'Charisma'};
function label(key:string){return labels[key]??key.replace(/([A-Z])/g,' $1').replaceAll('_',' ');}
export function ReadableFacts({value}:{value:unknown}){
 const facts:{name:string;value:string}[]=[];
 function visit(input:unknown,prefix=''){
  if(input&&typeof input==='object'){for(const [key,v] of Object.entries(input))visit(v,prefix?prefix+' / '+label(key):label(key));}
  else facts.push({name:prefix||'Status',value:input===null||input===undefined||input==='not_reported'||input==='unknown'?'Nicht gemeldet':typeof input==='boolean'?input?'Ja':'Nein':typeof input==='number'?input.toLocaleString('de-DE'):String(input)});
 }
 visit(value);
 return <dl className="readable-facts">{facts.slice(0,40).map((f,i)=><div key={i}><dt>{f.name}</dt><dd>{f.value}</dd></div>)}</dl>;
}
