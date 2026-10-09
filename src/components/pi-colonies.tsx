import type {ProjectRecord} from '@/lib/source-records';
import type {Character} from '@/lib/esi/sync';
import {Pin} from '@/lib/esi/normalizers';
import {storageSnapshot} from '@/lib/pi-analysis';
import {freshness} from '@/lib/time';
import {nameResolver} from '@/lib/names';
export function PiColonies({rows,characters}:{rows:ProjectRecord[];characters:Character[]}){
 const names=nameResolver(rows,characters),schematics=new Map(rows.filter(r=>r.kind==='schematic_metadata').map(r=>[r.sourceEntityId,r]));
 const colonies=rows.filter(r=>r.kind==='pi_colony');
 return <section className="panel"><h2>PI / Kolonien</h2><p>{colonies.length} Kolonien. Produktion und Lager stammen aus dem letzten Snapshot; sie sind kein Verkaufserloes.</p>{colonies.map(r=>{
  const pins=(Array.isArray(r.data.pins)?r.data.pins:[]).map(p=>Pin.parse(p));
  const products=[...new Set(pins.map(p=>p.extractor_details?.product_type_id?names.type(p.extractor_details.product_type_id):String(schematics.get(p.factory_details?.schematic_id??p.schematic_id??'')?.data.schematic_name??'')).filter(Boolean))];
  const expiry=pins.map(p=>p.expiry_time).filter((t):t is string=>!!t).sort()[0];
  const status=r.connectionStatus==='disconnected'?'Verbindung getrennt':freshness(r.fetchedAt,r.sourceTimestamp)==='stale'?'Veralteter Stand':'Gespeicherter Stand';
  return <details className="session" key={r.deduplicationKey}><summary><strong>{names.character(r.sourceCharacterId)} / {names.entity(r.data.planetId)}</strong><span className="badge">{status}</span><span>{products.join(', ')||'Produkt nicht gemeldet'}</span></summary><p>{String(r.data.planetType)} / Command Center {String(r.data.upgradeLevel)} / {pins.length} Anlagen<br/>Programm: {expiry?'bis '+new Date(expiry).toLocaleString('de-DE')+' laut Programm':'Laufzeit nicht gemeldet'}<br/>Quelldatum: {r.sourceTimestamp?new Date(r.sourceTimestamp).toLocaleString('de-DE'):'Nicht gemeldet'}</p><div className="table-wrap"><table><thead><tr><th>Anlage</th><th>Produkt / Programm</th><th>Lagerinhalt</th><th>Auslastung</th></tr></thead><tbody>{pins.map(p=>{
   const schematic=p.factory_details?.schematic_id??p.schematic_id,meta=schematics.get(schematic),storage=storageSnapshot(p,rows);
   return <tr key={p.pin_id}><td>{names.type(p.type_id)}</td><td>{p.extractor_details?.product_type_id?names.type(p.extractor_details.product_type_id):String(meta?.data.schematic_name??'Kein Programm')}<br/><small>{p.expiry_time?new Date(p.expiry_time).toLocaleString('de-DE'):meta?String(meta.data.cycle_time)+' Sekunden je konfiguriertem Zyklus':''}</small></td><td>{p.contents?.map(c=>names.type(c.type_id)+': '+c.amount.toLocaleString('de-DE')).join('; ')||'Nicht gemeldet'}</td><td>{storage.percent===null?'Unbekannt':storage.percent.toFixed(0)+' %'}</td></tr>;
  })}</tbody></table></div><p>{Array.isArray(r.data.links)?r.data.links.length:0} Links / {Array.isArray(r.data.routes)?r.data.routes.length:0} Routen. Durchsatz ohne belegte Betriebsdaten unbekannt.</p></details>;
 })}{!colonies.length&&<p>Keine Koloniedaten fuer die Auswahl gemeldet.</p>}</section>;
}
