import {readFileSync} from 'node:fs';import {spawnSync} from 'node:child_process';
const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
const base=event.pull_request?.base?.sha??event.before,head=event.pull_request?.head?.sha??event.after;
if(!/^[a-f0-9]{40}$/.test(head??''))process.exit(2);
if(!/^[a-f0-9]{40}$/.test(base??''))process.exit(2);
const baseAvailable=spawnSync('git',['cat-file','-e',base+'^{commit}'],{stdio:'ignore'}).status===0;
if(!baseAvailable&&!/^0+$/.test(base)&&event.forced!==true)process.exit(2);
const range=/^0+$/.test(base)||!baseAvailable?head:base+'..'+head;
const result=spawnSync(process.execPath,['scripts/security-scan.mjs','--range',range],{stdio:'inherit'});process.exitCode=result.status??2;
