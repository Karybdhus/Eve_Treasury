'use client';
import {useState} from 'react';
import {ReadableFacts} from './readable-facts';
export function ReadableEvidence({sourceKey}:{sourceKey:string}){
 const [value,setValue]=useState<unknown>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){setBusy(true);setError('');try{const r=await fetch('/api/display-data?kind=source&key='+encodeURIComponent(sourceKey),{cache:'no-store'});const data=await r.json();if(!r.ok)throw new Error(data.error);setValue(data.raw);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div>{value===undefined?<button disabled={busy} onClick={()=>void load()}>{busy?'Beleg wird geladen':'Zahlungsbeleg lesbar oeffnen'}</button>:<ReadableFacts value={value}/>}<small>Quellreferenz: {sourceKey}</small>{error&&<p role="alert">{error}</p>}</div>;
}