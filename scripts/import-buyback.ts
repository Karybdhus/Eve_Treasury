import {readFileSync} from 'node:fs';
import path from 'node:path';
import {getDatabase} from '../src/lib/db';
import {importBuybackWorkbook} from '../src/lib/buyback-excel';
const filename=process.argv[2];if(!filename)throw new Error('Usage: npx tsx scripts/import-buyback.ts path-to-workbook.xlsx');
async function main(){const db=getDatabase();try{const result=await importBuybackWorkbook(db,new Uint8Array(readFileSync(filename)),path.basename(filename));console.log(JSON.stringify({imported:result.imported,skipped:result.skipped,controls:result.controls.length,discrepancies:result.controls.filter(c=>c.differenceISK!==null&&c.differenceISK!=='0.00'),unavailableComparisons:result.controls.filter(c=>c.differenceISK===null).length},null,2));}finally{db.close();}}
void main().catch(error=>{console.error(error instanceof Error?error.message:'Import failed');process.exitCode=1;});
