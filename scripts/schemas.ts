import {z} from 'zod';
import {mkdirSync,writeFileSync} from 'node:fs';
import {schemas} from '../src/lib/contracts';
mkdirSync('schemas',{recursive:true});
for(const [name,schema] of Object.entries(schemas))writeFileSync(`schemas/${name}.schema.json`,JSON.stringify(z.toJSONSchema(schema,{io:'input'}),null,2)+'\n');
