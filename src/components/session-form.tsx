'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
export function SessionForm({characters}:{characters:{id:string;name:string}[]}){
 const router=useRouter(),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);const form=event.currentTarget,input=new FormData(form);
  try{
   const response=await fetch('/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:input.get('type'),characterId:input.get('characterId'),notes:input.get('notes')})});
   const result=await response.json();if(!response.ok)throw new Error(result.error);setMessage('Session gestartet');form.reset();router.refresh();
  }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 return <form onSubmit={submit} className="session-form"><label>Charakter<select name="characterId" required>{characters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Aktivitaet<select name="type">{['hacking','salvage','mining','ratting','other'].map(t=><option key={t}>{t}</option>)}</select></label><label>Notizen<textarea name="notes" maxLength={2000}/></label><button disabled={busy||!characters.length}>{busy?'Bitte warten...':'Start Session'}</button><p aria-live="polite">{message}</p></form>;
}
export function EndSession({id}:{id:string}){
 const router=useRouter(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function end(){setBusy(true);try{const res=await fetch('/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'end',sessionId:id})});const data=await res.json();if(!res.ok)throw new Error(data.error);router.refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <><button className="secondary" disabled={busy} onClick={()=>void end()}>End Session</button><p role="status">{error}</p></>;
}
