import {z} from 'zod';
import {mkdirSync,writeFileSync} from 'node:fs';
import {StandardEnvelope,standardPayloads} from '../src/lib/report-standard';
mkdirSync('schemas/standard',{recursive:true});
writeFileSync('schemas/standard/Envelope.schema.json',JSON.stringify(z.toJSONSchema(StandardEnvelope,{io:'input'}),null,2)+'\n');
for(const [name,schema] of Object.entries(standardPayloads))writeFileSync('schemas/standard/'+name+'.payload.schema.json',JSON.stringify(z.toJSONSchema(schema,{io:'input'}),null,2)+'\n');
