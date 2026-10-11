import Link from 'next/link';
import type {Summary} from '@/lib/dashboard-statistics';
import {realizedStatistics,walletLiquidity} from '@/lib/dashboard-statistics';
import type {ProjectRecord} from '@/lib/source-records';
import type {funding} from '@/lib/accounting';
import {format,known} from '@/lib/accounting';
import {displayMoney} from '@/lib/money';
export function CompactOverview({summary,rows,goal,lastSync}:{summary:Summary;rows:ProjectRecord[];goal:ReturnType<typeof funding>;lastSync:string|null}){
 const query=new URLSearchParams();for(const [key,value] of Object.entries(summary.filter)){if(value)query.set(key,String(value));}const suffix='?'+query;
 const wallet=walletLiquidity(rows),stats=realizedStatistics(summary),issues=summary.unresolved+summary.unknown;
 return <section className="panel compact-overview"><h2>Projekt auf einen Blick</h2><div className="metrics"><div className="metric"><span>Relevante Wallet-Liquiditaet</span><strong>{displayMoney(wallet.amountISK)}</strong><small>{wallet.count} Wallet-Snapshots; kein Gewinn oder freigegebenes Budget.</small></div><div className="metric"><span>Realisierte Einnahmen</span><strong>{displayMoney(stats.grossRevenueISK)}</strong><small>Bruttozufluesse {summary.filter.from} bis {summary.filter.to}; keine Nettogewinnbehauptung.</small></div><div className="metric"><span>Aktives PLEX-Ziel / Mindestziel</span><strong>{format(goal.targets[0].progress,'%')}</strong><small>{format(goal.physical,'PLEX')} physisch / {goal.targets[0].plex} Ziel. Idealziel: {goal.targets[1].plex}.</small></div></div><div className="overview-status"><p>{issues?issues+' relevante Datenprobleme':'Keine offenen Finanzkonflikte im erfassten Zeitraum.'} {summary.quality==='incomplete'?'Datenabdeckung unvollstaendig.':''}</p><p>Letzter erfolgreicher ESI-Sync: {lastSync??'Nicht gemeldet'}</p></div><div className="actions"><Link href={'/weekly'+suffix}>Weekly Performance</Link><Link href={'/plex'+suffix}>PLEX Goal</Link><Link href={'/imports'+suffix}>Daten pruefen</Link></div><p className="muted">{known(goal.physical)?'Bestand laut letztem Ist-Bericht.':'Heutiger Ist-Bestand nicht gemeldet.'}{wallet.stale?' Getrennte Charaktere enthalten veraltete Wallet-Daten.':''}</p></section>;
}
