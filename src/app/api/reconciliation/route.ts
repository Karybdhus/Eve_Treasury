import {recordCostComponent} from '@/lib/reconciliation-costs';
import {allocateEvidence,revokeAllocation} from '@/lib/reconciliation-allocations';
import {financialFilter} from '@/lib/financial-filter';
import {z} from 'zod';
import {getDatabase} from '@/lib/db';
import {assertLocalRequest} from '@/lib/esi/config';
import {reconciliation,decideReconciliation,consolidatedFinancials,financialCategories} from '@/lib/reconciliation';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const Input=z.object({action:z.enum(['link','reject','unlink','classify']),left:z.string().min(1).max(300),right:z.string().min(1).max(300).optional(),reason:z.string().min(1).max(2000),category:z.enum(financialCategories).optional(),expectedRevision:z.number().int().positive().optional()}).strict();
export async function GET(request:Request){
 try{assertLocalRequest(request);}catch{return Response.json({error:'Local access required'},{status:403});}
 const url=new URL(request.url),db=getDatabase();try{return Response.json({state:reconciliation(db),summary:consolidatedFinancials(db,financialFilter(Object.fromEntries(url.searchParams)))},{headers:{'Cache-Control':'no-store'}});}finally{db.close();}
}
export async function POST(request:Request){
 try{assertLocalRequest(request,true);}catch{return Response.json({error:'Same-origin local mutation required'},{status:403});}
 try{const text=await request.text();if(Buffer.byteLength(text)>10000)return Response.json({error:'Maximum 10 KB'},{status:413});const raw=JSON.parse(text),db=getDatabase();try{if(raw.action==='cost_component'){const {action,...input}=raw;void action;reconciliation(db);recordCostComponent(db,input);return Response.json(reconciliation(db));}if(raw.action==='allocate'){const {action,...input}=raw;void action;reconciliation(db);allocateEvidence(db,input);return Response.json(reconciliation(db));}if(raw.action==='revoke_allocation'){const {action,...input}=raw;void action;reconciliation(db);revokeAllocation(db,input);return Response.json(reconciliation(db));}const input=Input.parse(raw);return Response.json(decideReconciliation(db,input));}finally{db.close();}}catch(e){return Response.json({error:(e as Error).message},{status:400});}
}
