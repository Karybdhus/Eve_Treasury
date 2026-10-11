import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {z} from 'zod';
const require=createRequire(process.cwd()+'/package.json');
const unzip=require('unzipper') as {Open:{file(path:string):Promise<{files:{path:string;buffer():Promise<Buffer>}[]}>}};
const name=z.object({en:z.string()}).passthrough(),id=z.number().int().nonnegative();
const Type=z.object({_key:id,groupID:id,name,volume:z.number().nonnegative().optional(),capacity:z.number().nonnegative().optional()}).passthrough();
const Group=z.object({_key:id,categoryID:id,name}).passthrough();
const Recipe=z.object({_key:id,name,cycleTime:z.number().positive(),pins:z.array(id),types:z.array(z.object({_key:id,isInput:z.boolean(),quantity:z.number().int().positive()}))});
async function main(){
const root='data/sde';mkdirSync(root,{recursive:true});
const url='https://developers.eveonline.com/static-data/tranquility/latest.jsonl';
const latest=await(await fetch(url)).text(),meta=z.object({_key:z.literal('sde'),buildNumber:z.number().int().positive(),releaseDate:z.string()}).parse(latest.trim().split('\n').map(line=>JSON.parse(line)).find(x=>x._key==='sde'));
const archiveUrl=`https://developers.eveonline.com/static-data/tranquility/eve-online-static-data-${meta.buildNumber}-jsonl.zip`;
const downloadFile=root+'/download.json',cached=existsSync(downloadFile)?JSON.parse(readFileSync(downloadFile,'utf8')):{},archiveFile=root+'/official.zip';
if(!existsSync(archiveFile)||cached.buildNumber!==meta.buildNumber){const response=await fetch(archiveUrl);if(!response.ok)throw new Error('Official SDE download failed '+response.status);writeFileSync(archiveFile,Buffer.from(await response.arrayBuffer()));writeFileSync(downloadFile,JSON.stringify({...meta,url:archiveUrl}));}
const hash=createHash('sha256').update(readFileSync(archiveFile)).digest('hex'),archive=await unzip.Open.file(archiveFile);
async function rows(file:string):Promise<Record<string,unknown>[]>{const entry=archive.files.find(f=>f.path===file+'.jsonl');if(!entry)throw new Error('Official SDE missing '+file);return (await entry.buffer()).toString('utf8').trim().split('\n').map(line=>JSON.parse(line));}
const types=(await rows('types')).map(x=>Type.parse(x)),groups=(await rows('groups')).map(x=>Group.parse(x)),recipes=(await rows('planetSchematics')).map(x=>Recipe.parse(x));
const groupMap=new Map(groups.map(g=>[g._key,g])),needed=new Set(recipes.flatMap(r=>[...r.types.map(t=>t._key),...r.pins]));
for(const type of types)if(groupMap.get(type.groupID)?.categoryID===41)needed.add(type._key);
const systemNames=(process.argv.find(x=>x.startsWith('--systems='))?.split('=')[1]??'Kino').split(',');
const systems=(await rows('mapSolarSystems')).filter(x=>x.name&&systemNames.includes((x.name as {en:string}).en)).map(x=>({id:String(x._key),name:(x.name as {en:string}).en,planetIds:(x.planetIDs as number[]).map(String)}));
if(systems.length!==systemNames.length)throw new Error('Requested system not found in official SDE');
const planetIds=new Set(systems.flatMap(s=>s.planetIds)),planets=(await rows('mapPlanets')).filter(x=>planetIds.has(String(x._key))).map(x=>({id:String(x._key),systemId:String(x.solarSystemID),typeId:String(x.typeID)}));for(const p of planets)needed.add(Number(p.typeId));
const dogma=(await rows('typeDogma')).filter(x=>needed.has(Number(x._key))),categories=await rows('categories');
const accounting=(await rows('accountingEntryTypes')).filter(x=>['bounty','bounty_prize','bounty_prizes','ess_escrow_transfer','contract_price'].includes(String(x.internalName))).map(x=>({id:String(x._key),internalName:String(x.internalName),name:(x.name as {en:string}).en}));
const output={accounting,build:String(meta.buildNumber),releaseDate:meta.releaseDate,sourceUrl:archiveUrl,sha256:hash,importedAt:new Date().toISOString(),types:types.filter(t=>needed.has(t._key)).map(t=>({id:String(t._key),name:t.name.en,groupId:String(t.groupID),groupName:groupMap.get(t.groupID)?.name.en??'UNKNOWN',categoryId:String(groupMap.get(t.groupID)?.categoryID??0),volume:t.volume??null,capacity:t.capacity??null,tier:({'Planet Liquid-Gas - Raw Resource':'P0','Planet Organic - Raw Resource':'P0','Planet Solid - Raw Resource':'P0','Basic Commodities - Tier 1':'P1','Refined Commodities - Tier 2':'P2','Specialized Commodities - Tier 3':'P3','Advanced Commodities - Tier 4':'P4'} as Record<string,string>)[groupMap.get(t.groupID)?.name.en??'']??null,dogma:(dogma.find(x=>x._key===t._key)?.dogmaAttributes??[])})),recipes:recipes.map(r=>({id:String(r._key),name:r.name.en,cycleSeconds:r.cycleTime,pinTypeIds:r.pins.map(String),inputs:r.types.filter(t=>t.isInput).map(t=>({typeId:String(t._key),quantity:String(t.quantity)})),outputs:r.types.filter(t=>!t.isInput).map(t=>({typeId:String(t._key),quantity:String(t.quantity)}))})),systems,planets,categories:categories.filter(c=>[42,43,41].includes(Number(c._key))).map(c=>({id:String(c._key),name:(c.name as {en:string}).en})),resourceCompatibility:'UNKNOWN: official planetary yield/type compatibility is not asserted; configure evidenced local inputs'};
mkdirSync('seed/sde',{recursive:true});writeFileSync('seed/sde/pi-catalog.json',JSON.stringify(output,null,2)+'\n');console.log(`Official SDE ${output.build}; SHA256 ${hash}; ${output.recipes.length} recipes; ${output.types.length} types; ${planets.length} planets`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
