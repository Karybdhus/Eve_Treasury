'use client';
import {useSearchParams} from 'next/navigation';
export function CharacterFilter({characters,current}:{characters:{character_id:string;name:string}[];current?:string}){
 const params=useSearchParams();
 return <form method="get" className="panel">{['from','to','source'].map(key=>params.get(key)?<input key={key} type="hidden" name={key} value={params.get(key)!}/>:null)}<label>Charakterauswahl<select name="characterId" value={current??''} onChange={e=>e.currentTarget.form?.requestSubmit()}><option value="">Alle Charaktere</option>{characters.map(c=><option key={c.character_id} value={c.character_id}>{c.name}</option>)}</select></label><noscript><button>Auswahl anwenden</button></noscript><small>Bestand und Aktivitaeten beziehen sich auf diese Auswahl. Fehlende Quellen bleiben unbekannt.</small></form>;
}

