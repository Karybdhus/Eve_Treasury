'use client';
import Link from 'next/link';
import {usePathname,useSearchParams} from 'next/navigation';
const links=[['overview','Overview'],['plex','PLEX Goal'],['weekly','Weekly Performance'],['mining','Mining / Ice'],['pi','Planetary Industry'],['assets','Assets'],['trading','Trading'],['industry','Industry (geparkt)'],['buyback','Buyback'],['characters','Characters / Skills'],['imports','Data / Imports'],['settings','Settings']];
export function Navigation(){const pathname=usePathname(),characterId=useSearchParams().get('characterId');return <nav aria-label="Hauptnavigation">{links.map(([href,label],i)=><Link href={`/${href}${characterId?'?characterId='+encodeURIComponent(characterId):''}`} key={href} aria-current={pathname===`/${href}`?'page':undefined}><span className="nav-number">{String(i+1).padStart(2,'0')}</span>{label}</Link>)}</nav>;}
