'use client';
import {RawEvidence} from './raw-evidence';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import type {reconciliation,FinancialCategory} from '@/lib/reconciliation';
import {financialCategories} from '@/lib/financial-categories';
import {displayMoney} from '@/lib/money';
const categories=financialCategories;
export function ReconciliationPanel({state}:{state:ReturnType<typeof reconciliation>}){
 const router=useRouter(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[left,setLeft]=useState(''),[right,setRight]=useState(''),[reason,setReason]=useState(''),[category,setCategory]=useState('UNKNOWN'),[filter,setFilter]=useState('all'),[search,setSearch]=useState(''),[sourcePage,setSourcePage]=useState(0),[proposalPage,setProposalPage]=useState(0);
 const matching=state.sources.filter(s=>[s.key,s.date,s.category,s.amountISK].join(' ').toLowerCase().includes(search.toLowerCase()));
 const visible=matching.slice(sourcePage*25,(sourcePage+1)*25);
 const choices=[...new Map([...visible,...state.sources.filter(s=>s.key===left||s.key===right)].map(s=>[s.key,s])).values()];
 const proposals=state.proposals.filter(p=>filter==='all'||p.status===filter);
 const linkBySource=new Map(state.links.map(l=>[l.source_key,l]));
 const peersByEvent=new Map<string,typeof state.links>();for(const l of state.links){const peers=peersByEvent.get(l.event_id)??[];peers.push(l);peersByEvent.set(l.event_id,peers);}
 async function act(action:string,l=left,r=right,revision?:number){
  if(!reason.trim()){setError('Bitte einen Beleg- oder Korrekturgrund eingeben.');return;}
  setBusy(true);setError('');
  try{const res=await fetch('/api/reconciliation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,left:l,...(r?{right:r}:{}),reason,...(action==='classify'?{category:category as FinancialCategory,expectedRevision:revision}:{})})});const result=await res.json();if(!res.ok)throw new Error(result.error);router.refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="panel reconciliation-panel"><h2>Reconciliation / Ereignisse und Rohbelege</h2><p>Gleicher Betrag und Tag sind nur Vorschlaege. Bestaetigung bedeutet: Beide Belege beschreiben dasselbe vollstaendige Ereignis. Tagesaggregate mit mehreren Zahlungen nicht pauschal verknuepfen.</p>
 <label>Belege suchen<input value={search} onChange={e=>{setSearch(e.target.value);setSourcePage(0);}} placeholder="Datum, Kategorie, Betrag oder Referenz"/></label><p>{matching.length} Belege / Seite {sourcePage+1}</p><div className="actions"><button disabled={sourcePage===0} onClick={()=>setSourcePage(sourcePage-1)}>Vorige Belege</button><button disabled={(sourcePage+1)*25>=matching.length} onClick={()=>setSourcePage(sourcePage+1)}>Weitere Belege</button></div>
 <label>Beleggrund / Korrekturgrund<input value={reason} onChange={e=>setReason(e.target.value)} maxLength={2000}/></label>
 <div className="metrics"><label>Erster Beleg<select value={left} onChange={e=>setLeft(e.target.value)}><option value="">Auswaehlen</option>{choices.map(s=><option key={s.key} value={s.key}>{s.date??'Datum unbekannt'} / {s.source} / {s.sourceId}</option>)}</select></label><label>Zweiter Beleg<select value={right} onChange={e=>setRight(e.target.value)}><option value="">Auswaehlen</option>{choices.map(s=><option key={s.key} value={s.key}>{s.source} / {s.sourceId}</option>)}</select></label></div>
 <button disabled={busy||!left||!right} onClick={()=>act('link')}>Manuell verknuepfen</button>
 <label>Kategorie fuer Korrektur<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
 <button disabled={busy||!left} onClick={()=>act('classify',left,'',state.events.find(e=>e.event_id===state.links.find(l=>l.source_key===left)?.event_id)?.revision)}>Klassifikation korrigieren</button>
 {error&&<p role="alert">{error}</p>}
 <h3>Moegliche Dubletten / Konflikte / abgelehnte Vorschlaege</h3>
 <label>Status<select value={filter} onChange={e=>{setFilter(e.target.value);setProposalPage(0);}}>{['all','proposal','conflict','rejected'].map(s=><option key={s}>{s}</option>)}</select></label>
 <div className="table-wrap"><table><thead><tr><th>Belege</th><th>Matching-Grund</th><th>Status</th><th>Aktion</th></tr></thead><tbody>{proposals.slice(proposalPage*25,(proposalPage+1)*25).map(p=><tr key={p.pairKey}><td>{p.left}<br/>{p.right}</td><td>{p.reason}</td><td>{p.status}</td><td><button disabled={busy||p.status==='conflict'} onClick={()=>act('link',p.left,p.right)}>Match bestaetigen</button><button disabled={busy} onClick={()=>act('reject',p.left,p.right)}>Ablehnen</button></td></tr>)}</tbody></table></div>
 <p>{proposals.length} Vorschlaege / Seite {proposalPage+1}</p><div className="actions"><button disabled={proposalPage===0} onClick={()=>setProposalPage(proposalPage-1)}>Vorige Vorschlaege</button><button disabled={(proposalPage+1)*25>=proposals.length} onClick={()=>setProposalPage(proposalPage+1)}>Weitere Vorschlaege</button></div><h3>Belege / Zuordnungsstatus</h3><p>{state.sources.length} Belege; eindeutige Matches bleiben bei erneutem Import/Sync erhalten. Geldlose Produktion und Snapshots bleiben sichtbar.</p>
 <div className="evidence-list" tabIndex={0} role="region" aria-label="Reconciliation-Belege und Zuordnungsstatus">{visible.map(s=>{const link=linkBySource.get(s.key),peers=link?peersByEvent.get(link.event_id)??[]:[];return <details key={s.key}><summary>{s.date??'Datum unbekannt'} / {s.source} / {s.category} / {displayMoney(s.amountISK)} / {s.characterId??'Projekt'} / {s.sourceId} / {peers.length>1?(link?.manual?'manual_confirmed':'automatic_unique'):s.complete?'open':'incomplete'}</summary><p>Ereignis: {link?.event_id}; Methode: {link?.method}; Evidenz: {link?.evidence}; Zeitpunkt: {link?.confirmed_at}; Geldpraezision: {s.precision}; Quellstatus: {s.status}.</p>{peers.length>1&&<button disabled={busy} onClick={()=>act('unlink',s.key,'')}>Verknuepfung loesen</button>}<h4>Original-Rohbeleg</h4><RawEvidence sourceKey={s.key}/></details>;})}</div>
 </section>;
}
