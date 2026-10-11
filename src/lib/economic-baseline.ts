import {observedMarketCapital,type FrozenMarketCapital} from './baseline-market-capital';
import {staticNames} from './names';
import {savedAssetPrices} from './asset-valuation';
import {CONTINUITY_SCHEMA,addOriginLot,lotAcquisition} from './inventory-continuity';
import {createHash,randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {type ProjectRecord} from './source-records';
import {exactJson,moneyFact,signedCents} from './exact-money';
import {decimal} from './money';

export const BASELINE_SCHEMA=[
 ...CONTINUITY_SCHEMA,
 'CREATE INDEX IF NOT EXISTS records_contract_entity ON project_records(kind,source_entity_id,fetched_at)',
 "CREATE INDEX IF NOT EXISTS records_wallet_contract_context ON project_records(CAST(json_extract(body,'$.context_id') AS TEXT),source_character_id) WHERE kind='wallet_journal' AND is_current=1 AND status='actual'",

 'CREATE TABLE economic_source_observations(character_id TEXT NOT NULL,source TEXT NOT NULL,checked_at TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(character_id,source))',
 'CREATE TABLE economic_baselines(id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN (\'opening\',\'comparison\',\'entry\')),created_at TEXT NOT NULL,body TEXT NOT NULL,fingerprint TEXT NOT NULL)',
 "CREATE UNIQUE INDEX economic_opening_once ON economic_baselines(kind) WHERE kind='opening'",
 "CREATE TRIGGER economic_baseline_immutable_update BEFORE UPDATE ON economic_baselines BEGIN SELECT RAISE(ABORT,'Economic baselines are immutable'); END",
 "CREATE TRIGGER economic_baseline_immutable_delete BEFORE DELETE ON economic_baselines BEGIN SELECT RAISE(ABORT,'Economic baselines are immutable'); END",
 "CREATE UNIQUE INDEX economic_entry_once ON economic_baselines(json_extract(body,'$.characterIds[0]')) WHERE kind='entry'",
 'CREATE TABLE economic_baseline_audit(id TEXT PRIMARY KEY,baseline_id TEXT REFERENCES economic_baselines(id),action TEXT NOT NULL,created_at TEXT NOT NULL,body TEXT NOT NULL)',
];
export type PriceEvidence={typeId:string;unitISK:string;observedAt:string;source:string};
export type BaselineSource={characterId:string;source:string;status:string;observedAt:string|null;checkedAt:string|null;cacheUntil:string|null;rawIds:string[];versions?:SourceObservation['versions']};
export type BaselineAsset={frozenName?:string|null;frozenLocationName?:string|null;frozenOwnerName?:string|null;itemId:string;typeId:string;owner:string;location:string;parent:string|null;quantity:string;observedAt:string;sourceKey:string;rawId:string|null;origin:'OPENING_STOCK'|'INTERNAL_TRANSFER';unitISK:string|null;valueISK:string|null;priceSource:string|null;priceAt:string|null};
export type BaselineSnapshot={marketCapital?:FrozenMarketCapital[];id:string;kind:'opening'|'comparison'|'entry';name:string;comment:string;createdAt:string;mode:'initial'|'migration'|'comparison'|'entry';characterIds:string[];coverage:BaselineSource[];wallets:{characterId:string;valueISK:string|null;observedAt:string|null;sourceKey:string|null}[];assets:BaselineAsset[];walletISK:string|null;knownWalletISK:string;assetISK:string|null;knownAssetISK:string;unknownAssetCount:number;totalISK:string|null;issues:string[];complete:boolean;acceptedIncomplete:boolean;observationFrom:string|null;observationTo:string|null;cutoverByCharacter:Record<string,string|null>;fingerprint:string};
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const natural=(v:unknown)=>{if(typeof v==='number'&&!Number.isSafeInteger(v))throw Error('Unsafe asset quantity or identifier');const text=String(v);if(!/^(0|[1-9][0-9]*)$/.test(text))throw Error('Invalid asset quantity or identifier');return BigInt(text).toString();};
function setting<T>(db:DatabaseSync,name:string){const row=db.prepare('SELECT body FROM app_settings WHERE name=?').get(name) as {body:string}|undefined;return row?JSON.parse(row.body) as T:null;}
export function openingBaseline(db:DatabaseSync):BaselineSnapshot|null{const row=db.prepare("SELECT body FROM economic_baselines WHERE kind='opening'").get() as {body:string}|undefined;return row?JSON.parse(row.body):null;}
export function completeCharacterSetup(db:DatabaseSync,ids:string[],at=new Date().toISOString()){
 if(openingBaseline(db))throw Error('Opening setup is already frozen');const connected=db.prepare("SELECT character_id FROM characters WHERE connection_status='connected'").all().map(r=>String(r.character_id));
 if(!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!connected.includes(id)))throw Error('Select a nonempty connected character group');
 db.prepare('INSERT INTO app_settings VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at').run('economic_setup',JSON.stringify({characterIds:[...ids].sort(),completedAt:at,mode:db.prepare("SELECT 1 FROM project_records WHERE source='esi' AND status='actual' LIMIT 1").get()?'migration':'initial'}),at);
}
export function prepareBaseline(db:DatabaseSync,input:{kind?:BaselineSnapshot['kind'];mode?:BaselineSnapshot['mode'];characterIds?:string[];name?:string;comment?:string;prices?:PriceEvidence[];now?:string;maxSkewMs?:number}={}):BaselineSnapshot{
 const now=input.now??new Date().toISOString(),setup=setting<{characterIds:string[];completedAt:string;mode?:BaselineSnapshot['mode']}>(db,'economic_setup');const ids=[...(input.characterIds??setup?.characterIds??[])].sort();
 if(new Set(ids).size!==ids.length)throw Error('Duplicate baseline character');const issues:string[]=[],coverage:BaselineSource[]=[],wallets:BaselineSnapshot['wallets']=[],assets:BaselineAsset[]=[];
 if(!Number.isFinite(Date.parse(now)))throw Error('Invalid baseline timestamp');
 if(!ids.length)issues.push('Character setup is not complete');
 const sourceRows:{kind:string;source_character_id:string;deduplication_key:string;fetched_at:string;body:string;raw_id:string|null;data_quality:string}[]=[];
 for(const id of ids)for(const source of ['wallet','assets']){
  const snapshot=settingSource(db,id,source);if(!snapshot)continue;
  for(const rawId of snapshot.rawIds){const raw=db.prepare('SELECT endpoint,payload_text,fetched_at,character_id FROM raw_source_records WHERE raw_id=?').get(rawId) as {endpoint:string;payload_text:string;fetched_at:string;character_id:string}|undefined;
   if(!raw||raw.character_id!==id)throw Error('Source snapshot owner or raw version is invalid');
   if(source==='wallet'&&raw.endpoint==='/characters/'+id+'/wallet')sourceRows.push({kind:'wallet_balance',source_character_id:id,deduplication_key:'esi:'+id+':wallet_balance',fetched_at:snapshot.versions?.find(v=>v.rawId===rawId)?.observedAt??(snapshot.rawIds.length===1?snapshot.observedAt:raw.fetched_at),body:JSON.stringify({wallet:exactJson(raw.payload_text)}),raw_id:rawId,data_quality:'measured'});
   if(source==='assets'&&raw.endpoint==='/characters/'+id+'/assets'){const list=exactJson(raw.payload_text);if(!Array.isArray(list))throw Error('Incomplete asset source snapshot');for(const data of list)sourceRows.push({kind:'asset_snapshot',source_character_id:id,deduplication_key:'esi:'+id+':asset:'+natural(data.item_id),fetched_at:snapshot.versions?.find(v=>v.rawId===rawId)?.observedAt??(snapshot.rawIds.length===1?snapshot.observedAt:raw.fetched_at),body:JSON.stringify(data),raw_id:rawId,data_quality:'measured'});}
  }
 }
 const catalog=staticNames(),metadata=new Map(db.prepare("SELECT kind,source_entity_id,json_extract(body,'$.name') name FROM project_records WHERE kind IN ('type_metadata','entity_metadata') AND is_current=1").all().map(r=>[r.kind+':'+r.source_entity_id,String(r.name)])),people=new Map(db.prepare('SELECT character_id,name FROM characters').all().map(r=>[String(r.character_id),String(r.name)]));
 const group=new Set(ids),seen=new Set<string>(),prices=new Map<string,PriceEvidence>();
 for(const p of input.prices??savedAssetPrices(db,now)){if(prices.has(p.typeId)||moneyFact(p.unitISK).value===null||signedCents(p.unitISK)<0n||!Number.isFinite(Date.parse(p.observedAt))||Date.parse(p.observedAt)>Date.parse(now)||!p.source.trim())throw Error('Invalid or ambiguous price evidence');prices.set(p.typeId,p);}
 const cutover:Record<string,string|null>={};
 for(const id of ids){
  const character=db.prepare('SELECT connection_status FROM characters WHERE character_id=?').get(id);if(character?.connection_status!=='connected')issues.push('Character connection unavailable: '+id);
  for(const source of ['wallet','assets','market','contracts','mining','pi','industry']){
   const state=setting<{status:string;lastSuccessfulAt?:string;checkedAt?:string;cacheUntil?:string}>(db,'esi_sync:source:'+id+':'+source);
   const kinds=source==='wallet'?['wallet_balance']:source==='assets'?['asset_snapshot']:[];
   const relevant=sourceRows.filter(r=>r.source_character_id===id&&kinds.includes(r.kind));
   const checkpoint=settingSource(db,id,source);
   const rawIds=checkpoint?.rawIds??[...new Set(relevant.map(r=>r.raw_id).filter((v):v is string=>!!v))].sort();
   const endpoint='/characters/'+id+'/'+source;const matchingVersions=rawIds.filter(rawId=>db.prepare('SELECT 1 FROM raw_source_records WHERE raw_id=? AND endpoint=? AND character_id=?').get(rawId,endpoint,id));if(source==='wallet'&&matchingVersions.length!==1||source==='assets'&&matchingVersions.length===0)issues.push(source+' complete endpoint evidence missing or ambiguous: '+id);
   const rawTimes=rawIds.map(rawId=>checkpoint?.versions?.find(v=>v.rawId===rawId)?.observedAt??(rawIds.length===1?checkpoint?.observedAt:undefined)??String(db.prepare('SELECT fetched_at FROM raw_source_records WHERE raw_id=?').get(rawId)?.fetched_at??'')).filter(Boolean);
   if(['wallet','assets'].includes(source)&&rawTimes.some(t=>Date.parse(now)-Date.parse(t)>3600000))issues.push(source+' observation older than one hour: '+id);
   if(rawTimes.length&&Date.parse(rawTimes.sort().at(-1)!)-Date.parse(rawTimes[0])>(input.maxSkewMs??900000))issues.push(source+' pages exceed observation window: '+id);
   const observed=checkpoint?.observedAt??rawTimes.sort().at(-1)??null;
   coverage.push({characterId:id,source,status:state?.status??'not_reported',observedAt:observed,checkedAt:checkpoint?.checkedAt??state?.checkedAt??state?.lastSuccessfulAt??null,cacheUntil:checkpoint?.cacheUntil??state?.cacheUntil??null,rawIds,versions:checkpoint?.versions});
   if(['wallet','assets'].includes(source)){
    if(!checkpoint)issues.push(source+' complete source snapshot not captured: '+id);
    if(state?.status!=='success')issues.push(source+' source not successful: '+id);
    if(!checkpoint?.checkedAt||!Number.isFinite(Date.parse(checkpoint.checkedAt))||Date.parse(checkpoint.checkedAt)>Date.parse(now)||Date.parse(checkpoint.checkedAt)<Date.parse(setup?.completedAt??now))issues.push(source+' source has no post-setup successful observation: '+id);
   }
  }
  const balance=sourceRows.find(r=>r.source_character_id===id&&r.kind==='wallet_balance');let value:string|null=null;
  if(balance){const raw=balance.raw_id?db.prepare('SELECT payload_text FROM raw_source_records WHERE raw_id=?').get(balance.raw_id):null;const data=raw?exactJson(String(raw.payload_text)):JSON.parse(balance.body);value=moneyFact(typeof data==='object'&&data!==null?(data as {wallet:unknown}).wallet:data).value;}
  if(value===null)issues.push('Wallet is unknown: '+id);
  wallets.push({characterId:id,valueISK:value,observedAt:balance?.fetched_at??null,sourceKey:balance?.deduplication_key??null});
  cutover[id]=coverage.filter(c=>c.characterId===id&&['wallet','assets'].includes(c.source)).map(c=>c.observedAt??c.checkedAt).filter((v):v is string=>!!v).sort().at(-1)??null;
 }
 for(const row of sourceRows.filter(r=>r.kind==='asset_snapshot'&&group.has(r.source_character_id))){
  if(row.data_quality==='historical_seed')continue;const data=JSON.parse(row.body) as ProjectRecord['data'];if(data.is_corporation===true||data.for_corporation===true)continue;
  const itemId=natural(data.item_id),typeId=natural(data.type_id),quantity=natural(data.quantity),location=natural(data.location_id);if(seen.has(itemId)){issues.push('Conflicting asset ownership: '+itemId);continue;}seen.add(itemId);
  const price=prices.get(typeId),unit=price?moneyFact(price.unitISK).value:null;
  assets.push({frozenName:catalog?.types[typeId]?.name??metadata.get('type_metadata:'+typeId)??null,frozenLocationName:catalog?.entities[location]?.name??metadata.get('entity_metadata:'+location)??null,frozenOwnerName:people.get(row.source_character_id)??null,itemId,typeId,quantity,location,parent:data.location_type==='item'?location:null,owner:row.source_character_id,observedAt:row.fetched_at,sourceKey:row.deduplication_key,rawId:row.raw_id,origin:'OPENING_STOCK',unitISK:unit,valueISK:unit===null?null:decimal(signedCents(unit)*BigInt(quantity)),priceAt:price?.observedAt??null,priceSource:price?.source??null});
 }
 const times=coverage.filter(c=>['wallet','assets'].includes(c.source)).map(c=>c.observedAt??c.checkedAt).filter((v):v is string=>!!v).sort();
 if(times.some(t=>!Number.isFinite(Date.parse(t))||Date.parse(t)>Date.parse(now)))issues.push('Invalid or future observation time');
 if(times.length&&Date.parse(times.at(-1)!)-Date.parse(times[0])>(input.maxSkewMs??900000))issues.push('Source observation window exceeds 15 minutes');
 const knownWalletISK=decimal(wallets.reduce((n,w)=>n+(w.valueISK===null?0n:signedCents(w.valueISK)),0n)),walletISK=ids.length&&wallets.every(w=>w.valueISK!==null)?knownWalletISK:null;
 const knownAssetISK=decimal(assets.reduce((n,a)=>n+(a.valueISK===null?0n:signedCents(a.valueISK)),0n)),unknownAssetCount=assets.filter(a=>a.valueISK===null).length,assetISK=ids.length&&issues.length===0&&!unknownAssetCount&&coverage.filter(c=>c.source==='assets').every(c=>c.status==='success')?knownAssetISK:null;
 const snapshot:BaselineSnapshot={marketCapital:ids.map(id=>observedMarketCapital(db,id,now)),id:randomUUID(),kind:input.kind??'opening',mode:input.mode??setup?.mode??'initial',name:input.name??'Ersteinrichtung',comment:input.comment??'',createdAt:now,characterIds:ids,coverage,wallets,assets,walletISK,knownWalletISK,assetISK,knownAssetISK,unknownAssetCount,totalISK:walletISK!==null&&assetISK!==null?decimal(signedCents(walletISK)+signedCents(assetISK)):null,issues,complete:issues.length===0,acceptedIncomplete:false,observationFrom:times[0]??null,observationTo:times.at(-1)??null,cutoverByCharacter:cutover,fingerprint:''};
 snapshot.fingerprint=hash({...snapshot,id:undefined,fingerprint:undefined});return snapshot;
}
export function persistOpeningBaseline(db:DatabaseSync,candidate:BaselineSnapshot,options:{acceptIncomplete?:boolean;confirmMigration?:boolean}={}){
 db.exec('BEGIN IMMEDIATE');try{
  const existing=openingBaseline(db);if(existing){db.exec('COMMIT');return existing;}
  if(candidate.kind!=='opening'||!candidate.characterIds.length)throw Error('A nonempty opening snapshot is required');
  if(candidate.mode==='migration'&&!options.confirmMigration)throw Error('Migration cutover requires explicit confirmation');
  if(!candidate.complete&&!options.acceptIncomplete)throw Error('Opening source coverage is incomplete');
  if(candidate.fingerprint!==hash({...candidate,id:undefined,fingerprint:undefined}))throw Error('Baseline fingerprint differs');
  const setup=setting<{characterIds:string[];completedAt:string;mode?:BaselineSnapshot['mode']}>(db,'economic_setup');if(!setup||JSON.stringify(setup.characterIds)!==JSON.stringify(candidate.characterIds))throw Error('Character setup changed');
  for(const source of candidate.coverage){const current=settingSource(db,source.characterId,source.source);if(current&&(JSON.stringify(current.rawIds)!==JSON.stringify(source.rawIds)||current.checkedAt!==source.checkedAt||JSON.stringify(current.versions)!==JSON.stringify(source.versions)))throw Error('Baseline source changed; prepare again');}
  for(const source of candidate.coverage)for(const rawId of source.rawIds)if(!db.prepare('SELECT 1 FROM raw_source_records WHERE raw_id=?').get(rawId))throw Error('Opening evidence no longer exists');
  const saved={...candidate,acceptedIncomplete:!candidate.complete&&options.acceptIncomplete===true};saved.fingerprint=hash({...saved,id:undefined,fingerprint:undefined});
  db.prepare('INSERT INTO economic_baselines VALUES(?,?,?,?,?)').run(saved.id,saved.kind,saved.createdAt,JSON.stringify(saved),saved.fingerprint);
  for(const asset of saved.assets)if(asset.quantity!=='0')addOriginLot(db,lotAcquisition({sourceKey:'opening:'+saved.id+':'+asset.itemId,owner:asset.owner,typeId:asset.typeId,quantity:asset.quantity,at:saved.createdAt,origin:'OPENING_STOCK',category:null,quality:'proven',costISK:null,evidence:[asset.sourceKey,...(asset.rawId?[asset.rawId]:[])],baselineId:saved.id}));
  db.prepare('INSERT INTO economic_baseline_audit VALUES(?,?,?,?,?)').run(randomUUID(),saved.id,'opening_frozen',saved.createdAt,JSON.stringify({fingerprint:saved.fingerprint,coverage:saved.coverage,acceptedIncomplete:saved.acceptedIncomplete}));
  db.exec('COMMIT');return saved;
 }catch(e){db.exec('ROLLBACK');throw e;}
}export function baselineList(db:DatabaseSync){return (db.prepare('SELECT body FROM economic_baselines ORDER BY created_at,id').all() as {body:string}[]).map(r=>JSON.parse(r.body) as BaselineSnapshot);}
export function selectedBaseline(db:DatabaseSync){const active=setting<{id:string}>(db,'economic_comparison');return baselineList(db).find(b=>b.id===active?.id)??openingBaseline(db);}
export function selectBaseline(db:DatabaseSync,id:string){if(!db.prepare("SELECT 1 FROM economic_baselines WHERE id=? AND kind IN ('opening','comparison')").get(id))throw Error('Unknown comparison point');const at=new Date().toISOString();db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO app_settings VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at').run('economic_comparison',JSON.stringify({id}),at);db.prepare('INSERT INTO economic_baseline_audit VALUES(?,?,?,?,?)').run(randomUUID(),id,'comparison_selected',at,'{}');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
export function createComparisonBaseline(db:DatabaseSync,input:{name:string;comment?:string;prices?:PriceEvidence[];now?:string}){
 if(!openingBaseline(db))throw Error('Opening baseline is required');if(!input.name.trim()||input.name.length>100||(input.comment?.length??0)>2000)throw Error('Invalid comparison label');
 const ids=db.prepare("SELECT character_id FROM characters WHERE connection_status='connected' ORDER BY character_id").all().map(r=>String(r.character_id));const draft=prepareBaseline(db,{kind:'comparison',mode:'comparison',characterIds:ids,...input});
 db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO economic_baselines VALUES(?,?,?,?,?)').run(draft.id,draft.kind,draft.createdAt,JSON.stringify(draft),draft.fingerprint);db.prepare('INSERT INTO economic_baseline_audit VALUES(?,?,?,?,?)').run(randomUUID(),draft.id,'comparison_created',draft.createdAt,JSON.stringify({fingerprint:draft.fingerprint}));db.exec('COMMIT');return draft;}catch(e){db.exec('ROLLBACK');throw e;}
}
export function finalizeInitialBaseline(db:DatabaseSync){if(openingBaseline(db))return openingBaseline(db);const setup=setting<{mode:string}>(db,'economic_setup');if(!setup||setup.mode==='migration')return null;const candidate=prepareBaseline(db);return candidate.complete?persistOpeningBaseline(db,candidate):null;}

export type SourceObservation={rawIds:string[];observedAt:string;checkedAt:string;cacheUntil:string|null;versions?:{rawId:string;observedAt:string;endpoint:string}[]};
function settingSource(db:DatabaseSync,id:string,source:string):SourceObservation|null{const row=db.prepare('SELECT body FROM economic_source_observations WHERE character_id=? AND source=?').get(id,source) as {body:string}|undefined;return row?JSON.parse(row.body):null;}
export function captureBaselineSource(db:DatabaseSync,id:string,source:string,observation:SourceObservation){db.prepare('INSERT INTO economic_source_observations VALUES(?,?,?,?) ON CONFLICT(character_id,source) DO UPDATE SET checked_at=excluded.checked_at,body=excluded.body').run(id,source,observation.checkedAt,JSON.stringify(observation));}
export function baselineForCharacter(db:DatabaseSync,id:string){const row=db.prepare("SELECT b.id,json_extract(b.body,'$.createdAt') AS created_at,json_extract(b.body,'$.characterIds') AS ids FROM economic_baselines b WHERE b.kind IN ('opening','entry') AND EXISTS(SELECT 1 FROM json_each(b.body,'$.characterIds') c WHERE CAST(c.value AS TEXT)=?) ORDER BY b.created_at LIMIT 1").get(id);return row?{id:String(row.id),createdAt:String(row.created_at),characterIds:JSON.parse(String(row.ids)) as string[]}:null;}
export function captureCharacterEntries(db:DatabaseSync,successfulOwners:string[]){
 if(!openingBaseline(db))return [];const added:BaselineSnapshot[]=[];
 for(const id of successfulOwners){if(baselineForCharacter(db,id))continue;const character=db.prepare("SELECT connected_at FROM characters WHERE character_id=? AND connection_status='connected'").get(id);if(!character)continue;
  const draft=prepareBaseline(db,{kind:'entry',mode:'entry',characterIds:[id],name:'Charaktereintritt'});const earlierItems=new Map(baselineList(db).filter(b=>['opening','entry'].includes(b.kind)).flatMap(b=>b.assets.map(a=>[a.itemId,a] as const)));for(const asset of draft.assets){const earlier=earlierItems.get(asset.itemId);if(!earlier)continue;if(earlier.typeId!==asset.typeId||earlier.quantity!==asset.quantity||!successfulOwners.includes(earlier.owner)){draft.issues.push('Entry contains ambiguous previously tracked item identities; own transfer requires reconciliation');draft.complete=false;}else asset.origin='INTERNAL_TRANSFER';}draft.fingerprint=hash({...draft,id:undefined,fingerprint:undefined});if(!draft.complete||draft.coverage.filter(c=>['wallet','assets'].includes(c.source)).some(c=>!c.checkedAt||Date.parse(c.checkedAt)<Date.parse(String(character.connected_at))))continue;
  db.exec('BEGIN IMMEDIATE');try{if(baselineForCharacter(db,id)){db.exec('COMMIT');continue;}db.prepare('INSERT INTO economic_baselines VALUES(?,?,?,?,?)').run(draft.id,draft.kind,draft.createdAt,JSON.stringify(draft),draft.fingerprint);for(const asset of draft.assets)if(asset.quantity!=='0'&&asset.origin==='OPENING_STOCK')addOriginLot(db,lotAcquisition({sourceKey:'opening:'+draft.id+':'+asset.itemId,owner:id,typeId:asset.typeId,quantity:asset.quantity,at:draft.createdAt,origin:'OPENING_STOCK',category:null,quality:'proven',costISK:null,evidence:[asset.sourceKey,...(asset.rawId?[asset.rawId]:[])],baselineId:draft.id}));db.prepare('INSERT INTO economic_baseline_audit VALUES(?,?,?,?,?)').run(randomUUID(),draft.id,'character_entry_frozen',draft.createdAt,JSON.stringify({fingerprint:draft.fingerprint,scopeContribution:true}));db.exec('COMMIT');added.push(draft);}catch(e){db.exec('ROLLBACK');throw e;}
 }return added;
}
export function baselineSummary(snapshot:BaselineSnapshot){const {assets,wallets,...rest}=snapshot;return {...rest,assetCount:assets.length,walletCount:wallets.length};}
export function baselineSummaries(db:DatabaseSync){return (db.prepare("SELECT json_remove(body,'$.assets','$.wallets') body,json_array_length(body,'$.assets') asset_count,json_array_length(body,'$.wallets') wallet_count FROM economic_baselines ORDER BY created_at,id").all() as {body:string;asset_count:number;wallet_count:number}[]).map(r=>({...JSON.parse(r.body) as Omit<BaselineSnapshot,'assets'|'wallets'>,assetCount:r.asset_count,walletCount:r.wallet_count}));}
