'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
const links=[['overview','Overview'],['weekly','Weekly'],['mining','Mining / Ice'],['pi','Planetary Industry'],['trading','Trading'],['industry','Industry'],['imports','Data / Imports'],['characters','Characters / ESI'],['sessions','Manual Sessions']];
export function Navigation(){const pathname=usePathname();return <nav aria-label="Hauptnavigation">{links.map(([href,label],i)=><Link href={`/${href}`} key={href} aria-current={pathname===`/${href}`?'page':undefined}><span className="nav-number">0{i+1}</span>{label}</Link>)}</nav>;}
