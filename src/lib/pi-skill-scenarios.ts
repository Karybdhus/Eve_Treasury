import type {ProjectRecord} from './source-records';
import type {Chain} from './pi-chains';
import {SkillSnapshot,Queue} from './esi/skills';
export function applyPiSkills(scenario:Chain,rows:ProjectRecord[],mode:'current'|'queue'):Chain{
 const ids=['2505','2495','2406','2403'],names=['commandCenter','consolidation','planetology','advancedPlanetology'] as const;
 const characters=rows.filter(r=>r.kind==='skill_snapshot'&&r.status==='actual'&&r.sourceCharacterId).map(row=>{const snapshot=SkillSnapshot.parse(row.data),active=new Map(snapshot.skills.map(s=>[s.skill_id,s.active_skill_level]));const current=Object.fromEntries(names.map((name,i)=>[name,active.get(ids[i])??0])) as NonNullable<Chain['characters'][number]['current']>;const planned={...current},queue=rows.find(r=>r.kind==='skill_queue'&&r.sourceCharacterId===row.sourceCharacterId);if(mode==='queue'&&queue)for(const item of Queue.parse(queue.data.queue)){const at=ids.indexOf(item.skill_id);if(at>=0)planned[names[at]]=Math.max(planned[names[at]],item.finished_level);}
 return {id:row.sourceCharacterId!,snapshotAt:row.sourceTimestamp??row.fetchedAt,current,planned:mode==='queue'&&queue?planned:null};});
 if(!characters.length)throw new Error('No actual local skill snapshot; scenario assumptions remain required');
 let owner=0,assigned=0;const colonies=scenario.colonies.map(c=>{if(assigned>=1+(characters[owner].planned??characters[owner].current).consolidation&&owner<characters.length-1){owner++;assigned=0;}assigned++;return {...c,characterId:characters[owner].id,commandCenterLevel:(characters[owner].planned??characters[owner].current).commandCenter};});
 return {...scenario,characters,colonies};
}