import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';import path from 'node:path';import {tmpdir} from 'node:os';import {ESLint} from 'eslint';
test('Next lint rules still discover route roots through the safe glob override',async()=>{
 const root=mkdtempSync(path.join(tmpdir(),'treasury-lint-'));mkdirSync(path.join(root,'apps/dashboard/pages'),{recursive:true});writeFileSync(path.join(root,'apps/dashboard/pages/target.tsx'),'export default function Target(){return null;}');
 const eslint=new ESLint({overrideConfig:{settings:{next:{rootDir:path.join(root,'apps/*').replaceAll('\\','/')}}}});
 const [result]=await eslint.lintText('export default function Page(){return <a href="/target">Target</a>;}',{filePath:'src/app/security-lint-fixture.tsx'});
 assert.ok(result.messages.some(m=>m.ruleId==='@next/next/no-html-link-for-pages'),JSON.stringify(result.messages));
});
