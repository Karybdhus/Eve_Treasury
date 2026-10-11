'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
export function CharacterActions({id,connected,configured}:{id:string;connected:boolean;configured:boolean}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),router=useRouter();
 async function act(action:string){
  setBusy(true);setMessage('');
  try{
   const response=await fetch('/api/characters/'+id+'/'+action,{method:'POST'}),result=await response.json();
   if(!response.ok)throw new Error(result.error);
   setMessage(action==='disconnect'?'Lokal getrennt; gespeicherte Tokens entfernt.':'Synchronisierung '+(result.started?'gestartet':'laeuft bereits')+'. Fortschritt in den zentralen Sync-Details.');
   if(action==='sync')window.dispatchEvent(new Event('esi-sync-started'));router.refresh();
  }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 return <div><div className="actions"><button disabled={busy||!connected||!configured} onClick={()=>void act('sync')}>{busy?'Bitte warten...':'Manueller Sync'}</button><form method="post" action="/api/auth/eve/start"><input type="hidden" name="characterId" value={id}/><button className="secondary" disabled={busy||!configured}>{connected?'Reauthorize':'Verbinden'}</button></form>{connected&&<button className="secondary" disabled={busy} onClick={()=>void act('disconnect')}>Disconnect</button>}</div><p aria-live="polite" className="muted">{message}</p></div>;
}
