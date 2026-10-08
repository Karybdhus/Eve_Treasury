import {DatabaseSync} from 'node:sqlite';
import {existsSync,mkdirSync} from 'node:fs';
import path from 'node:path';

export function backupDatabase(source:string,destination:string){
 const input=path.resolve(source),output=path.resolve(destination);
 if(input===output||!existsSync(input)||existsSync(output))throw new Error('Backup requires an existing source and a new destination');
 if(input.startsWith('\\\\')||output.startsWith('\\\\'))throw new Error('Use local disks for SQLite and backup creation');
 mkdirSync(path.dirname(output),{recursive:true});
 const db=new DatabaseSync(input,{readOnly:true});
 try{
  db.exec('PRAGMA busy_timeout=5000');
  db.prepare('VACUUM INTO ?').run(output);
 }finally{db.close();}
 const copy=new DatabaseSync(output,{readOnly:true});
 try{
  const check=copy.prepare('PRAGMA integrity_check').all() as {integrity_check:string}[];
  if(check.length!==1||check[0].integrity_check!=='ok')throw new Error('Backup integrity check failed');
  return {schemaVersion:(copy.prepare('PRAGMA user_version').get() as {user_version:number}).user_version};
 }finally{copy.close();}
}
