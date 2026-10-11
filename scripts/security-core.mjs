import {createHash,createDecipheriv} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,existsSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';

export const secretNames=['EVE_CLIENT_SECRET','TOKEN_ENCRYPTION_KEY','APPLICATION_SECRET','AGENT_READ_API_KEY','JANICE_API_KEY','DASHBOARD_ACCESS_PASSWORD','GITHUB_TOKEN','GH_TOKEN','ESI_ACCESS_TOKEN','ESI_REFRESH_TOKEN'];
export const defaultPolicy={
 version:1,publicExamples:['.env.example'],syntheticSecretPattern:'^(?:invalid-synthetic-(?:access|refresh)|test-only-[a-z0-9-]+|(?:order[0-9]+|fixture|synthetic)-[a-z0-9-]*(?:only|secret|token|key)[a-z0-9-]*|not-a-valid-token|fixture-client)$',
 privatePaths:['(^|/)AGENTS(?:\\.[^/]*)?\\.md$','(^|/)REPORT_SYNC_STATE\\.json$','(^|/)DASHBOARD_[^/]+\\.md$','^data/','(^|/)\\.env(?:\\..*)?$','\\.(?:sqlite(?:3)?|db)(?:[.-].*)?$','\\.(?:bak|backup|dump|log|pem|key|p12|pfx)$','(^|/)(?:backups|private|private-reports|oauth-diagnostics|esi-raw|qa-screenshots)/','^docs/qa/','^scripts/(?:order[0-9]+|night[0-9]+)']
};
const credentialRules=[
 ['private-key','CRITICAL',/-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g],
 ['github-token','HIGH',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/g],
 ['jwt-token','HIGH',/\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\b/g],
 ['known-api-token','HIGH',/\b(?:AKIA[0-9A-Z]{16}|AIza[\w-]{30,}|xox[baprs]-[A-Za-z0-9-]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{32,})\b/g],
 ['credential-url','HIGH',/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|https?):\/\/[^\s/:]+:[^\s/@]{6,}@[^\s"']+/g],
 ['named-secret','HIGH',/\b(?:access_token|refresh_token|client_secret|token_encryption_key|application_secret|agent_read_api_key|janice_api_key|dashboard_access_password|password|api[_-]?key|pkce_verifier|code_verifier|oauth_state)["']?\s*[:=]\s*["']([^"'\s]{12,})["']/gi]
];
const privacyRules=[
 ['drive-identifier','MEDIUM',/https?:\/\/(?:docs|drive)\.google\.com\/(?:document\/d|spreadsheets\/d|presentation\/d|file\/d|drive\/(?:u\/\d+\/)?folders)\/[A-Za-z0-9_-]{20,}/g],
 ['drive-metadata','MEDIUM',/["'](?:folderId|driveFolderId|parent_ids)["']\s*:\s*(?:\[\s*)?["'][A-Za-z0-9_-]{20,}["']/g],
 ['workstation-path','MEDIUM',/\b[A-Z]:[\\/]Users[\\/](?!(?:example|public|default|username)(?:[\\/]|\b))[^\\/\s"'<>]+/gi],
 ['unix-user-path','MEDIUM',/\/(?:home|Users)\/(?!(?:example|user|username)(?:\/|\b))[^/\s"'<>]+/g],
 ['database-dump','HIGH',/-- (?:PostgreSQL|MySQL) database dump/g]
];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function inspectFile(filename,bytes,{policy=defaultPolicy,comparisons=[],entropy=false}={}){
 filename=filename.replaceAll('\\','/');const body=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes),text=body.toString('utf8'),findings=[];
 const add=(rule,risk,line,status='REVIEW_REQUIRED',recommendation='Review privately; sanitize or replace with a synthetic example before publication')=>{
  const id=digest([filename,rule,line??0].join('|')).slice(0,24);if(!findings.some(f=>f.id===id))findings.push({id,rule,risk,file:filename,line:line??null,status,recommendation});
 };
 if(!policy.publicExamples.includes(filename)&&policy.privatePaths.some(rule=>new RegExp(rule,'i').test(filename)))add('private-file-class','MEDIUM',null,'CONFIRMED','Remove from index only; preserve local original and ignore it');
 if(body.subarray(0,16).toString().startsWith('SQLite format 3'))add('database-binary','HIGH',null,'CONFIRMED','Preserve privately; do not publish a database');
 for(const [rule,risk,expression] of [...credentialRules,...privacyRules]){
  const regex=new RegExp(expression.source,expression.flags);for(const match of text.matchAll(regex)){
   const line=text.slice(0,match.index).split('\n').length;
   if(rule==='credential-url'&&filename.startsWith('tests/')&&match[0]===['https:', '', 'user:invalid-synthetic-secret@dashboard.fixture.ts.net'].join('/')){add(rule,'LOW',line,'SYNTHETIC','Explicit invalid URL parser fixture');continue;}
   if(rule==='named-secret'&&/^(?:tests\/|scripts\/fixtures\/)/.test(filename)&&new RegExp(policy.syntheticSecretPattern,'i').test(match[1])){add(rule,'LOW',line,'SYNTHETIC','Known invalid fixture literal; keep it clearly synthetic');continue;}
   add(rule,risk,line,rule.startsWith('drive-')||rule==='workstation-path'?'CONFIRMED':'REVIEW_REQUIRED');
  }
 }
 for(const value of comparisons)if(value.value.length>=value.minimumLength&&text.includes(value.value))add(value.kind==='secret'?'local-secret-match':'local-private-value-match',value.kind==='secret'?'CRITICAL':'MEDIUM',text.slice(0,text.indexOf(value.value)).split('\n').length,'CONFIRMED',value.kind==='secret'?'Block publication; privately assess exposure and safe rotation':'Anonymize this locally confirmed private identifier or financial value');
 if(entropy)for(const match of text.matchAll(/["']([A-Za-z0-9_+/=-]{32,})["']/g)){const value=match[1];if(/^[a-f0-9]+$/i.test(value)||new RegExp(policy.syntheticSecretPattern,'i').test(value))continue;const frequency=new Map();for(const c of value)frequency.set(c,(frequency.get(c)??0)+1);const score=[...frequency.values()].reduce((n,v)=>n-v/value.length*Math.log2(v/value.length),0);if(score>=4.4)add('entropy-candidate','LOW',text.slice(0,match.index).split('\n').length,'REVIEW_REQUIRED','Optional entropy suspicion only; assess privately, never rotate solely from this signal');}
 return {findings,sha256:digest(body),bytes:body.length,binary:body.includes(0)};
}
export function git(root,args,{input,encoding='utf8'}={}){
 try{return execFileSync('git',['-C',root,...args],{encoding,input,maxBuffer:512*1024*1024,stdio:['pipe','pipe','pipe']});}catch{throw Error('Git enumeration failed: '+args[0]);}
}
function tree(root,commit){return git(root,['ls-tree','-r','-z',commit]).split('\0').filter(Boolean).map(row=>{const tab=row.indexOf('\t'),[mode,type,oid]=row.slice(0,tab).split(' ');return {file:row.slice(tab+1),oid,type,mode,commit};});}
function blobs(root,oids){
 const unique=[...new Set(oids)];if(!unique.length)return new Map();
 const batch=spawnSync('git',['-C',root,'cat-file','--batch'],{input:unique.join('\n')+'\n',encoding:null,maxBuffer:512*1024*1024,stdio:['pipe','pipe','pipe']});if(batch.error||batch.status!==0)throw Error('Complete Git blob reading failed');
 let at=0;const result=new Map();for(const oid of unique){const end=batch.stdout.indexOf(10,at);if(end<0)throw Error('Truncated Git blob header');const [actual,type,length]=batch.stdout.subarray(at,end).toString().split(' '),size=Number(length);if(actual!==oid||type!=='blob'||!Number.isSafeInteger(size)||size<0||end+size+1>=batch.stdout.length)throw Error('Invalid or truncated Git blob');result.set(oid,batch.stdout.subarray(end+1,end+1+size));at=end+size+2;}if(at!==batch.stdout.length)throw Error('Unexpected Git blob tail');return result;
}
export function localComparisons(root,{loadSecrets=false,requireLocal=false,environment=process.env}={}){
 const comparisons=[],loadedNames=[],errors=[],loadedPrivate=[];let encryptedCredentials=0;
 if(loadSecrets){
  const envFile=path.join(root,'.env.local');
  if(existsSync(envFile)){try{const require=createRequire(import.meta.url);require('@next/env').loadEnvConfig(root,false,{info(){},error(){}});}catch{errors.push('Local environment loading failed');}}
  for(const name of secretNames){const value=environment[name];if(value&&value.length>=12){comparisons.push({kind:'secret',value,minimumLength:12});loadedNames.push(name);}}
  const key=environment.TOKEN_ENCRYPTION_KEY,file=environment.DASHBOARD_DB?path.resolve(root,environment.DASHBOARD_DB):null;
  if(file&&existsSync(file)&&key){let db;try{db=new DatabaseSync(file,{readOnly:true});const decrypt=(value,context)=>{const [version,iv,tag,body]=value.split('.');if(version!=='v1')throw Error('Unsupported cipher');const cipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'base64'),Buffer.from(iv,'base64url'));cipher.setAAD(Buffer.from(context));cipher.setAuthTag(Buffer.from(tag,'base64url'));return Buffer.concat([cipher.update(Buffer.from(body,'base64url')),cipher.final()]).toString('utf8');};
   for(const r of db.prepare('SELECT character_id,access_cipher,refresh_cipher FROM encrypted_credentials').all()){comparisons.push({kind:'secret',value:decrypt(r.access_cipher,'access:'+r.character_id),minimumLength:12},{kind:'secret',value:decrypt(r.refresh_cipher,'refresh:'+r.character_id),minimumLength:12});encryptedCredentials++;}
   for(const r of db.prepare('SELECT name FROM characters').all())if(r.name.length>=4)comparisons.push({kind:'private',value:r.name,minimumLength:4});
   for(const r of db.prepare('SELECT state_hash,verifier_cipher FROM oauth_states').all())comparisons.push({kind:'secret',value:decrypt(r.verifier_cipher,'oauth:'+r.state_hash),minimumLength:12});
  }catch{errors.push('Local encrypted comparison loading failed');}finally{db?.close();}}
 }
 const privateFile=path.join(root,'.security.local.json');if(existsSync(privateFile)){try{const data=JSON.parse(readFileSync(privateFile,'utf8'));for(const r of data.comparisons??[]){if(!['secret','private'].includes(r.kind)||typeof r.value!=='string'||r.value.length<(r.kind==='secret'?12:4))throw Error('Invalid local comparison');comparisons.push({kind:r.kind,value:r.value,minimumLength:r.kind==='secret'?12:4});loadedPrivate.push(r.label??'local-comparison');}}catch{errors.push('Local private comparison configuration invalid');}}
 if(requireLocal&&(!loadedNames.length||!encryptedCredentials))errors.push('Required production secret and encrypted credential comparison unavailable');
 return {comparisons,coverage:{requested:loadSecrets,loadedNames,encryptedCredentials,privateComparisonCount:loadedPrivate.length,actualComparisonValues:comparisons.length,completeRequestedComparison:loadSecrets&&loadedNames.length>0&&errors.length===0,errors}};
}
export function scanRepository(root,{history=false,range=null,tracked=true,staged=true,policy=defaultPolicy,comparisons=[],entropy=false}={}){
 root=path.resolve(root);git(root,['rev-parse','--show-toplevel']);const findings=[],inventory=[],coverage={trackedFiles:0,stagedFiles:0,commits:0,reachableBlobs:0,historicalPathBlobPairs:0,binaryObjects:0,historyComplete:false};
 const inspect=(file,bytes,scope,extra={})=>{const r=inspectFile(file,bytes,{policy,comparisons,entropy});if(r.binary)coverage.binaryObjects++;for(const f of r.findings)findings.push({...f,scope,...extra});const actionable=r.findings.filter(f=>f.status!=='SYNTHETIC');inventory.push({file,scope,...extra,sha256:r.sha256,bytes:r.bytes,decision:actionable.some(f=>f.status==='CONFIRMED'&&f.rule==='private-file-class')?'PRIVATE':actionable.length?'REVIEW_REQUIRED':'PUBLIC',reason:actionable.length?actionable.map(f=>f.rule).join(', '):'Reviewed source, schema, synthetic fixture or public documentation; no publication findings',reviewStatus:actionable.length?'needs_review':'scanned'});};
 const current=git(root,['ls-files','-z']).split('\0').filter(Boolean);
 if(tracked)for(const file of current){const resolved=path.resolve(root,file);if(!existsSync(resolved))throw Error('Tracked file missing during scan');const real=realpathSync(resolved);if(real!==root&&!real.startsWith(root+path.sep))throw Error('Tracked file resolves outside checkout');inspect(file,readFileSync(real),'tracked');coverage.trackedFiles++;}
 if(staged){const entries=git(root,['ls-files','--stage','-z']).split('\0').filter(Boolean).map(row=>{const tab=row.indexOf('\t'),[mode,oid,stage]=row.slice(0,tab).split(' ');if(stage!=='0')throw Error('Unmerged index cannot pass security scan');return {file:row.slice(tab+1),oid,mode};});const contents=blobs(root,entries.map(e=>e.oid));for(const e of entries){inspect(e.file,contents.get(e.oid),'staged',{blob:e.oid});coverage.stagedFiles++;}}
 if(history||range){
  const commits=git(root,['rev-list',...(range?[range]:['--all'])]).trim().split('\n').filter(Boolean);coverage.commits=commits.length;
  const entries=new Map();for(const commit of commits)for(const e of tree(root,commit)){if(e.type!=='blob')continue;const id=e.oid+'\0'+e.file;const found=entries.get(id);if(found)found.commits.push(commit);else entries.set(id,{...e,commits:[commit]});}
  const contents=blobs(root,[...entries.values()].map(e=>e.oid));coverage.reachableBlobs=contents.size;coverage.historicalPathBlobPairs=entries.size;
  for(const e of entries.values())inspect(e.file,contents.get(e.oid),range?'outgoing':'history',{blob:e.oid,commits:e.commits});
  coverage.historyComplete=true;
 }
 const counts=Object.fromEntries(['tracked','staged','history','outgoing'].map(scope=>[scope,Object.fromEntries(['CRITICAL','HIGH','MEDIUM','LOW'].map(risk=>[risk,findings.filter(f=>f.scope===scope&&f.risk===risk&&f.status!=='SYNTHETIC').length]))]));
 const blockers=findings.filter(f=>f.status!=='SYNTHETIC'&&(f.risk==='CRITICAL'||f.risk==='HIGH'||f.risk==='MEDIUM'&&f.scope!=='history'));
 return {coverage,findings,inventory,summary:{counts,blockers:blockers.length,passed:blockers.length===0,limitations:['Local comparisons cover only successfully loaded values, not all past rotated secrets.','Binary objects are enumerated and signature/path checked; screenshot text and compressed payloads are not decoded.','Only reachable local refs and explicitly fetched remote refs are scanned; unrelated forks, old clones and unreachable GitHub caches are outside coverage.']}};
}
