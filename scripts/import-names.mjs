import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const root=process.cwd();process.chdir(root);
const unzip=createRequire(import.meta.url)('unzipper');
async function main(){
 fs.mkdirSync('data/sde',{recursive:true});
 const metadata=await(await fetch('https://developers.eveonline.com/static-data/tranquility/latest.jsonl')).text();
 const meta=metadata.trim().split('\n').map(JSON.parse).find(x=>x._key==='sde');
 if(!Number.isSafeInteger(meta?.buildNumber))throw Error('Invalid official SDE build');
 const url='https://developers.eveonline.com/static-data/tranquility/eve-online-static-data-'+meta.buildNumber+'-jsonl.zip';
 const filename='data/sde/official-'+meta.buildNumber+'.zip';
 if(!fs.existsSync(filename)){const response=await fetch(url);if(!response.ok)throw Error('SDE download failed');fs.writeFileSync(filename,Buffer.from(await response.arrayBuffer()));}
 const archive=await unzip.Open.file(filename),types={},entities={};
 for(const basename of ['types','mapSolarSystems','mapPlanets','npcCorporations','mapStations']){
  const entry=archive.files.find(x=>x.path===basename+'.jsonl');if(!entry)continue;
  const text=(await entry.buffer()).toString('utf8');
  for(const line of text.trim().split('\n')){const row=JSON.parse(line);const name=typeof row.name==='string'?row.name:row.name?.en;
   if(basename==='types'){if(name)types[String(row._key)]={name,volume:row.volume??null,capacity:row.capacity??null};}
   else if(name)entities[String(row._key)]={name,kind:basename};
  }
 }
 fs.writeFileSync('data/sde/names.json',JSON.stringify({build:String(meta.buildNumber),releaseDate:meta.releaseDate,sourceUrl:url,sha256:crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex'),types,entities}));
 console.log(JSON.stringify({officialBuild:meta.buildNumber,types:Object.keys(types).length,entities:Object.keys(entities).length}));
}
main().catch(()=>{console.error('Official static-name import failed; existing names retained.');process.exitCode=1;});
