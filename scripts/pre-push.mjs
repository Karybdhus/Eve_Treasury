import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const rows=readFileSync(0,'utf8').trim().split('\n').filter(Boolean);
const run=args=>{const r=spawnSync(process.execPath,['scripts/security-scan.mjs',...args],{stdio:'inherit'});if(r.status!==0)process.exit(r.status??2);};
run(existsSync('.env.local')?['--local-secrets']:[]);
for(const row of rows){const [,local,,remote]=row.split(/\s+/);if(!/^[a-f0-9]{40}$/.test(local??'')||! /^[a-f0-9]{40}$/.test(remote??''))process.exit(2);if(/^0+$/.test(local))continue;const baseAvailable=spawnSync('git',['cat-file','-e',remote+'^{commit}'],{stdio:'ignore'}).status===0;run(['--range',/^0+$/.test(remote)||!baseAvailable?local:remote+'..'+local]);}
