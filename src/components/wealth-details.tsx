'use client';
import {useState} from 'react';import dynamic from 'next/dynamic';
const WealthOverview=dynamic(()=>import('./wealth-overview').then(m=>m.WealthOverview),{loading:()=> <p>Vermoegensvergleich laden ...</p>});
export function WealthDetails(){const [open,setOpen]=useState(false);return <details className="panel treasury-secondary" onToggle={event=>{if(event.target===event.currentTarget)setOpen(event.currentTarget.open);}}><summary>Vermoegensvergleich und Quellenabdeckung</summary>{open&&<WealthOverview/>}</details>;}
