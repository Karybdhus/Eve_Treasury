import {SyncControl} from '@/components/sync-control';
import {Suspense} from 'react';
import type {Metadata} from 'next';
import Link from 'next/link';
import {Navigation} from '@/components/navigation';
import './globals.css';
export const metadata:Metadata={title:'Make EvE Free Again',description:'Lokales PLEX-Projekt und Accounting Dashboard'};
export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="de"><body><div className="app-shell"><aside className="sidebar"><Link href="/" className="brand"><span className="brand-mark">M</span><div>MAKE EvE<br/><strong>FREE AGAIN</strong></div></Link><div className="eyebrow nav-label">PROJECT CONTROL</div><Suspense fallback={<span>Navigation laedt...</span>}><Navigation/></Suspense><div className="sidebar-bottom"><span className="status-dot"/> LOCAL WORKSPACE<p>5 Accounts. Ein gemeinsames Ziel.</p><small>04.10.2026 - 31.12.2026</small></div></aside><main><header className="topbar"><span>FINANCE / OPERATIONS</span><SyncControl/></header>{children}<footer>Nur gemeldete Fakten. Keine automatischen Account-Aktionen. Berichtsperioden: Europe/Berlin. ESI-Quellzeiten bleiben erhalten.</footer></main></div></body></html>;
}
