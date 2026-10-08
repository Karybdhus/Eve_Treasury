'use client';
import {useState} from 'react';
import type {Summary} from '@/lib/dashboard-statistics';
import {buybackPeriods} from '@/lib/dashboard-statistics';
import {displayMoney} from '@/lib/money';
export function BuybackStatistics({summary}:{summary:Summary}){
 const [grain,setGrain]=useState<'week'|'month'|'year'>('week'),rows=buybackPeriods(summary,grain);
 return <section className="panel"><div className="section-title"><h2>Buyback-Statistik / belegte Zahlungen</h2><label>Zeitraum<select value={grain} onChange={e=>setGrain(e.target.value as typeof grain)}><option value="week">Woche</option><option value="month">Monat</option><option value="year">Jahr</option></select></label></div><p>Auszahlungen werden einmal je wirtschaftlichem Ereignis gezaehlt. Historische Excel-Aggregate bleiben getrennt. Keine pauschale 10-%-Kuerzung.</p><div className="table-wrap"><table><thead><tr><th>Zeitraum</th><th>Warenkategorie</th><th>Auszahlung</th><th>Belegte Kosten</th><th>Netto</th><th>Belege</th></tr></thead><tbody>{rows.map(r=><tr key={r.period+r.category}><td>{r.period}</td><td>{r.category}</td><td>{displayMoney(r.amountISK)}</td><td>{displayMoney(r.costsISK)}</td><td>{displayMoney(r.netISK)}</td><td><details><summary>{r.events.length} Ereignisse</summary>{r.events.map(e=><p key={e.eventId}>{e.date}: {displayMoney(e.amountISK)} / {e.sources.join(', ')}</p>)}</details></td></tr>)}</tbody></table></div>{!rows.length&&<p>Noch keine datierten belegten Buyback-Ereignisse.</p>}</section>;
}

