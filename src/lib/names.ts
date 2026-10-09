import {existsSync,readFileSync,statSync} from 'node:fs';
import type {ProjectRecord} from './source-records';
type Catalog={build:string;types:Record<string,{name:string;volume:number|null;capacity:number|null}>;entities:Record<string,{name:string;kind:string}>};
let dynamic:{mtime:number;value:Record<string,{name:string}>}|undefined;
function dynamicNames(){const path='data/sde/dynamic-names.json';if(!existsSync(path))return {};const mtime=statSync(path).mtimeMs;if(dynamic?.mtime!==mtime)dynamic={mtime,value:JSON.parse(readFileSync(path,'utf8'))};return dynamic!.value;}
let saved:{mtime:number;value:Catalog}|undefined;
export function staticNames(){
 const path='data/sde/names.json';if(!existsSync(path))return undefined;
 const mtime=statSync(path).mtimeMs;
 if(saved?.mtime!==mtime)saved={mtime,value:JSON.parse(readFileSync(path,'utf8')) as Catalog};
 return saved!.value;
}
export function nameResolver(rows:ProjectRecord[],characters:{character_id:string;name:string}[]=[]){
 const dynamic=dynamicNames(),catalog=staticNames(),types=new Map(rows.filter(r=>r.kind==='type_metadata').map(r=>[String(r.sourceEntityId),String(r.data.name)]));
 const entities=new Map(rows.filter(r=>r.kind==='entity_metadata').map(r=>[String(r.sourceEntityId),String(r.data.name)]));
 const people=new Map(characters.map(c=>[c.character_id,c.name]));
 return {build:catalog?.build,type:(id:unknown)=>catalog?.types[String(id)]?.name??types.get(String(id))??'Name noch nicht verfuegbar',entity:(id:unknown)=>people.get(String(id))??catalog?.entities[String(id)]?.name??entities.get(String(id))??dynamic[String(id)]?.name??'Standort noch nicht aufgeloest',character:(id:unknown)=>people.get(String(id))??'Charakter nicht zugeordnet'};
}
