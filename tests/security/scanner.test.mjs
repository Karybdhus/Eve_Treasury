import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectFile} from '../../scripts/security-core.mjs';
const has=(file,body,rule)=>inspectFile(file,body).findings.some(f=>f.rule===rule);
test('Private paths remain blocked at arbitrary depth',()=>{
 for(const file of ['nested/.env.local','nested/account.sqlite','nested/AGENTS.md','nested/REPORT_SYNC_STATE.json','data/financial.json','nested/private/report.md'])assert.ok(inspectFile(file,'{}').findings.some(f=>f.status==='CONFIRMED'),file);
 assert.equal(has('.env.example','APPLICATION_SECRET=','private-file-class'),false);
 assert.equal(has('src/lib/migrations.ts','export const version=8;','private-file-class'),false);
});
test('Known token shapes are blocked without disclosing values',()=>{
 const token=['ghp', 'a'.repeat(36)].join('_');const result=inspectFile('src/example.ts',token);
 assert.ok(result.findings.some(f=>f.rule==='github-token'));assert.ok(!JSON.stringify(result.findings).includes(token));
});
test('Synthetic fixtures cannot exempt locally confirmed secrets',()=>{
 const value='synthetic-secret-only-fixture';const result=inspectFile('tests/fixture.ts',['APPLICATION','SECRET'].join('_')+': '+JSON.stringify(value),{comparisons:[{kind:'secret',value,minimumLength:12}]});
 assert.ok(result.findings.some(f=>f.risk==='CRITICAL'));
});
test('Renamed SQLite content remains detectable',()=>assert.ok(has('example.txt','SQLite format 3'+String.fromCharCode(0),'database-binary')));
