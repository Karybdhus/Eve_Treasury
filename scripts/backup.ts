import {backupDatabase} from '../src/lib/database-backup';
const [source,destination]=process.argv.slice(2);
if(!source||!destination)throw new Error('Usage: npm run backup -- <existing-local-db> <new-local-backup>');
console.log('Consistent backup verified',backupDatabase(source,destination));
