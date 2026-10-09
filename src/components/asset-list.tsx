'use client';
import {useState} from 'react';
type Group={key:string;name:string;quantity:string|null;singleton:boolean;blueprint:boolean;positions:{owner:string;location:string;flag:string;quantity:string;asOf:string}[]};
export function AssetList({groups}:{groups:Group[]}){
 const [query,setQuery]=useState(''),[page,setPage]=useState(0);
 const filtered=groups.filter(g=>g.name.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name));
 const pages=Math.max(1,Math.ceil(filtered.length/25)),current=Math.min(page,pages-1);
 return <><label>Gegenstand suchen<input value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label><p>{filtered.length} Gruppen / Seite {current+1} von {pages}</p><div className="table-wrap"><table><thead><tr><th>Gegenstand</th><th>Menge</th><th>Besitzer / Standort</th></tr></thead><tbody>{filtered.slice(current*25,(current+1)*25).map(g=><tr key={g.key}><td>{g.name}{g.singleton&&<small> / Einzelstueck</small>}{g.blueprint&&<small> / Blueprint; Menge ungesichert</small>}</td><td>{g.quantity===null?'Unbekannt':BigInt(g.quantity).toLocaleString('de-DE')}</td><td><details><summary>{g.positions.length} Positionen / {new Set(g.positions.map(p=>p.owner)).size} Charaktere</summary>{g.positions.map((p,i)=><p key={i}>{p.owner} / {p.location} / {p.flag}: {p.quantity}<br/><small>Stand {new Date(p.asOf).toLocaleString('de-DE')}</small></p>)}</details></td></tr>)}</tbody></table></div><div className="actions"><button disabled={current===0} onClick={()=>setPage(current-1)}>Zurueck</button><button disabled={current+1>=pages} onClick={()=>setPage(current+1)}>Weiter</button></div></>;
}
