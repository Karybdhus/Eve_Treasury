import type {DatabaseSync} from 'node:sqlite';
const reads=new WeakMap<DatabaseSync,{revision:string;values:Map<string,unknown>}>();
// Connection-local writes and commits by other connections invalidate read-only results.
export function memoizedDatabaseRead<T>(db:DatabaseSync,key:string,compute:()=>T):T{
 const revision=String(db.prepare('SELECT total_changes() n').get()!.n)+':'+String(db.prepare('PRAGMA data_version').get()!.data_version);
 let cache=reads.get(db);if(!cache||cache.revision!==revision){cache={revision,values:new Map()};reads.set(db,cache);}
 if(cache.values.has(key))return structuredClone(cache.values.get(key) as T);
 const value=compute();cache.values.set(key,structuredClone(value));if(cache.values.size>512)cache.values.delete(cache.values.keys().next().value!);return value;
}
