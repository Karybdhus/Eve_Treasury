import path from 'node:path';

export function resolveDatabasePath(filename:string,baseDirectory=process.cwd()){
 if(filename===':memory:')return filename;
 if(!filename.trim()||filename.includes('\0'))throw new Error('Database path must be a non-empty local file path');
 if(/^[\\/]{2}/.test(filename))throw new Error('Database path must use a local disk, not a network path');
 if(/^[A-Za-z][A-Za-z0-9+.-]*:/.test(filename)&&!(/^[A-Za-z]:[\\/]/.test(filename)))throw new Error('Database path must be a file path, not a URI or drive-relative path');
 const resolved=path.resolve(baseDirectory,filename);
 if(/^[\\/]{2}/.test(resolved))throw new Error('Database path must use a local disk, not a network path');
 return resolved;
}
