import {spawnSync} from 'node:child_process';
const existing=spawnSync('git',['config','--get','core.hooksPath'],{encoding:'utf8'}).stdout.trim();
if(existing&&existing!=='.githooks'){console.error('Existing hook configuration retained; integrate manually.');process.exit(1);}
const result=spawnSync('git',['config','core.hooksPath','.githooks'],{stdio:'inherit'});process.exitCode=result.status??2;
