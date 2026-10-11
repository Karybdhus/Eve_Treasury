import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,readdirSync,unlinkSync,rmdirSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {randomBytes} from 'node:crypto';
import {EsiClient,type EsiResponse} from '../src/lib/esi/client';import {ESI_SCOPES} from '../src/lib/esi/config';import {saveAuthorization} from '../src/lib/esi/sso';import {syncCharacter} from '../src/lib/esi/sync';import {getDatabase} from '../src/lib/db';import {contractArchive,confirmContract,saveBuybackPolicy} from '../src/lib/esi-contracts';import {header,item} from './followup-fixtures';
let clock=0;
class ContractClient extends EsiClient{
 status='outstanding';failItems=false;noRecent=false;calls:string[]=[];
 constructor(id:string){super('fixture-unused-token',id);}
 override async get(p:string,_group:string,params:Record<string,string>={}):Promise<EsiResponse>{void _group;this.calls.push(p+':'+(params.page??''));const page=Number(params.page??1);let data:unknown,pages=1;
 if(p.endsWith('/contracts')){pages=this.noRecent?1:2;data=this.noRecent?[]:[header({contract_id:page===1?'99':'100',status:this.status})];}
 else if(/\/contracts\/\d+\/items$/.test(p)){if(this.failItems)throw new Error('ESI 403 fixture contract item read denied');pages=2;data=[item({record_id:String(page),quantity:page===1?'9007199254740993':'2'})];}
 else if(p.startsWith('/universe/types/'))data={type_id:Number(p.split('/').at(-1)),name:'Fixture type',group_id:25};
 else if(p.startsWith('/universe/groups/'))data={category_id:25,name:'Fixture ore group'};
 else throw new Error('Unexpected fixture ESI endpoint');
 return {data,rawText:JSON.stringify(data),fetchedAt:new Date(Date.parse('2026-10-08T00:00:00Z')+(++clock)*1000).toISOString(),pages,cached:false};}
}
test('Contract sync: paginated headers/items, shared archive, manual preservation, 403 rollback, 30-day absence and scope isolation',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'eve-contract-sync-')),envNames=['DASHBOARD_DB','DASHBOARD_DEMO_SEED','TOKEN_ENCRYPTION_KEY','APPLICATION_SECRET','EVE_CLIENT_ID','EVE_CALLBACK_URL'],before=new Map(envNames.map(k=>[k,process.env[k]]));process.env.DASHBOARD_DB=path.join(dir,'fixture.sqlite');process.env.DASHBOARD_DEMO_SEED='0';process.env.TOKEN_ENCRYPTION_KEY=randomBytes(32).toString('base64');process.env.APPLICATION_SECRET=randomBytes(32).toString('hex');process.env.EVE_CLIENT_ID='test-only-client';process.env.EVE_CALLBACK_URL='http://127.0.0.1:3000/api/auth/eve/callback';
 try{for(const id of ['1001','1002','1003'])saveAuthorization({id,name:'Fixture '+id,ownerHash:'fixture-owner',scopes:id==='1003'?[]:[ESI_SCOPES.contracts]},{access_token:'test-only-contract-access',refresh_token:'test-only-contract-refresh',expires_in:1200});
 const first=new ContractClient('1001'),result=await syncCharacter('1001',{client:first});assert.equal(result.results.contracts.status,'success');assert.equal(result.results.wallet.status,'scope_missing');assert.ok(first.calls.includes('/characters/1001/contracts:2'));assert.ok(first.calls.includes('/characters/1001/contracts/99/items:2'));
 let db=getDatabase();try{saveBuybackPolicy(db,{recipients:['9001'],rules:[]});const rows=contractArchive(db);assert.equal(rows.length,2);assert.equal((rows[0].raw.items as unknown[]).length,2);confirmContract(db,{contractId:'99',category:'pi',reason:'Fixture reviewed basket',expectedPayoutISK:'500',expectedRevision:0});}finally{db.close();}
 first.status='finished';first.failItems=true;assert.equal((await syncCharacter('1001',{client:first})).results.contracts.status,'error');db=getDatabase();try{assert.equal(contractArchive(db).find(c=>c.contractId==='99')?.status,'outstanding');}finally{db.close();}
 first.failItems=false;await syncCharacter('1001',{client:first});db=getDatabase();try{const c=contractArchive(db).find(c=>c.contractId==='99')!;assert.equal(c.status,'finished');assert.equal(c.category,'pi');assert.equal(c.expectedPayoutISK,'500.00');}finally{db.close();}
 const second=new ContractClient('1002');second.status='finished';await syncCharacter('1002',{client:second});first.noRecent=true;await syncCharacter('1001',{client:first});db=getDatabase();try{assert.equal(contractArchive(db).length,2);assert.deepEqual(contractArchive(db).find(c=>c.contractId==='99')?.observers,['1001','1002']);}finally{db.close();}
 const missing=new ContractClient('1003');assert.equal((await syncCharacter('1003',{client:missing})).results.contracts.status,'scope_missing');assert.deepEqual(missing.calls,[]);
 }finally{for(const [name,value] of before)if(value===undefined)delete process.env[name];else process.env[name]=value;for(const name of readdirSync(dir))unlinkSync(path.join(dir,name));rmdirSync(dir);}
});