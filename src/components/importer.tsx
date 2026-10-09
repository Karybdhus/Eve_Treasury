'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
export function Importer(){
 const input=useRef<HTMLInputElement>(null);const [busy,setBusy]=useState(false);const [messages,setMessages]=useState<string[]>([]);const router=useRouter();
 async function upload(files:FileList|null){
  if(!files||busy)return;setBusy(true);const results:string[]=[];
  for(const file of Array.from(files)){
   try{if(file.size>2_000_000)throw new Error('Maximal 2 MB pro Datei');
    const res=await fetch('/api/reports',{method:'POST',headers:{'Content-Type':'application/json','x-filename':encodeURIComponent(file.name)},body:await file.text()});
    const result=await res.json();if(!res.ok)throw new Error(result.error);results.push(`${file.name}: ${result.imported} importiert, ${result.skipped} bereits vorhanden`);
   }catch(e){results.push(`${file.name}: FEHLER - ${(e as Error).message}`);}
  }setMessages(results);setBusy(false);if(input.current)input.current.value='';router.refresh();
 }
 return <section className="panel compact-import"><div className="dropzone" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void upload(e.dataTransfer.files);}}><span className="eyebrow">JSON / SCHEMA 1.0</span><h2>Berichte hier ablegen</h2><p>Ein Bericht oder ein Array von Berichten. Pro Datei atomarer Import, maximal 2 MB.</p><input ref={input} type="file" accept=".json,application/json" multiple className="sr-only" aria-label="JSON-Berichte auswaehlen" onChange={e=>void upload(e.target.files)}/><button disabled={busy} onClick={()=>input.current?.click()}>{busy?'Import laeuft...':'Dateien auswaehlen'}</button></div><div aria-live="polite">{messages.map((m,i)=><pre className={m.includes('FEHLER')?'error':'success'} key={i}>{m}</pre>)}</div></section>;
}
