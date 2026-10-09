'use client';
import {useState} from 'react';
export function ItemIcon({typeId,name}:{typeId:string;name:string}){const [failed,setFailed]=useState(false);return <span className="item-icon">{!failed&&/^\d+$/.test(typeId)?
 // Direct official CDN: lazy browser caching, no proxy or local image database.
 // eslint-disable-next-line @next/next/no-img-element
 <img src={'https://images.evetech.net/types/'+typeId+'/icon?size=32'} width={32} height={32} alt={name} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<span role="img" aria-label={'Bild nicht verfuegbar: '+name}>&#9671;</span>}</span>;}
