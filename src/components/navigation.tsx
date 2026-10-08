'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
const links=[['overview','Overview'],['plex','PLEX Goal'],['weekly','Weekly Analytics'],['mining','Mining / Ice'],['pi','Planetary Industry'],['trading','Trading'],['industry','Industry'],['supplementary','Supplementary'],['buyback','Buyback'],['characters','Characters / Skills'],['insights','Insights'],['imports','Data / Imports'],['settings','Settings']];
export function Navigation(){const pathname=usePathname();return <nav aria-label="Hauptnavigation">{links.map(([href,label],i)=><Link href={`/${href}`} key={href} aria-current={pathname===`/${href}`?'page':undefined}><span className="nav-number">{String(i+1).padStart(2,'0')}</span>{label}</Link>)}</nav>;}
