'use client';
import Link from 'next/link';
import {usePathname,useSearchParams} from 'next/navigation';
const links=[['overview','Overview'],['plex','PLEX Goal'],['weekly','Weekly Performance'],['mining','Mining / Ice'],['pi','Planetary Industry'],['assets','Assets'],['trading','Trading'],['industry','Industry (geparkt)'],['contracts','Contracts'],['characters','Characters / Skills'],['imports','Data / Imports'],['settings','Settings']];
export function Navigation(){const pathname=usePathname(),params=useSearchParams(),retained=new URLSearchParams();for(const key of ['characterId','from','to','source']){const value=params.get(key);if(value)retained.set(key,value);}const query=retained.toString();return <nav aria-label="Hauptnavigation">{links.map(([href,label],i)=><Link href={`/${href}${query?'?'+query:''}`} key={href} aria-current={pathname===`/${href}`?'page':undefined}><span className="nav-number">{String(i+1).padStart(2,'0')}</span>{label}</Link>)}</nav>;}
