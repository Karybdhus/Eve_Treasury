'use client';
import {useState} from 'react';
export function RawEvidence({sourceKey}:{sourceKey:string}){const [data,setData]=useState<string>(),[error,setError]=useState('');async function load(){try{const r=await fetch('/api/display-data?kind=source&key='+encodeURIComponent(sourceKey),{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error);setData(JSON.stringify(d.raw,null,2));}catch(e){setError((e as Error).message);}}return <div>{data?<pre>{data}</pre>:<button onClick={()=>void load()}>Originalbeleg laden</button>}{error&&<p role="alert">{error}</p>}</div>;}
