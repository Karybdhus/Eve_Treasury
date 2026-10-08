import {z} from 'zod';
import type {EsiResponse} from './client';
import type {ProjectRecord} from '../source-records';
const id=z.union([z.number().int().positive().safe(),z.string().regex(/^\d+$/)]).transform(String),level=z.number().int().min(0).max(5),sp=z.number().int().nonnegative().safe();
export const SkillSnapshot=z.object({total_sp:sp,unallocated_sp:sp.optional(),skills:z.array(z.object({skill_id:id,trained_skill_level:level,active_skill_level:level,skillpoints_in_skill:sp}))});
export const Queue=z.array(z.object({queue_position:z.number().int().nonnegative(),skill_id:id,finished_level:level,start_date:z.iso.datetime({offset:true}).optional(),finish_date:z.iso.datetime({offset:true}).optional(),level_start_sp:sp.optional(),level_end_sp:sp.optional(),training_start_sp:sp.optional()}));
export const Attributes=z.object({charisma:z.number().int(),intelligence:z.number().int(),memory:z.number().int(),perception:z.number().int(),willpower:z.number().int(),bonus_remaps:z.number().int().optional(),last_remap_date:z.iso.datetime({offset:true}).optional(),accrued_remap_cooldown_date:z.iso.datetime({offset:true}).optional()});
export const economicSkills=[
 {id:'2505',name:'Command Center Upgrades',pillar:'pi',effect:'Command-Center-Stufe / CPU und Powergrid; kein direkter Produktionsbonus'},
 {id:'2495',name:'Interplanetary Consolidation',pillar:'pi',effect:'Ein weiterer Planet je Level, bis sechs Planeten'},
 {id:'2406',name:'Planetology',pillar:'pi',effect:'Hoehere Scanaufloesung; keine belegte direkte Mengensteigerung'},
 {id:'2403',name:'Advanced Planetology',pillar:'pi',effect:'Hoehere Scanaufloesung; keine belegte direkte Mengensteigerung'},
 {id:'16622',name:'Accounting',pillar:'trading',effect:'Sales Tax: Basis 7.5%, relative Reduktion 11% je Level'},
 {id:'3446',name:'Broker Relations',pillar:'trading',effect:'NPC-Broker-Basis 3%, minus 0.3 Prozentpunkte je Level; Standings zusaetzlich erforderlich'},
 {id:'16597',name:'Advanced Broker Relations',pillar:'trading',effect:'Relist-Discount: 50% plus 6 Prozentpunkte je Level'},
 {id:'3443',name:'Trade',pillar:'trading',effect:'Vier weitere Order-Slots je Level'},
 {id:'3444',name:'Retail',pillar:'trading',effect:'Acht weitere Order-Slots je Level'},
 {id:'16596',name:'Wholesale',pillar:'trading',effect:'16 weitere Order-Slots je Level'},
 {id:'18580',name:'Tycoon',pillar:'trading',effect:'32 weitere Order-Slots je Level'},
 {id:'3380',name:'Industry',pillar:'industry',effect:'4% kuerzere Manufacturing-Zeit je Level; theoretischer Multiplikator'},
 {id:'3387',name:'Mass Production',pillar:'industry',effect:'Ein weiterer Manufacturing-Job je Level'},
 {id:'24625',name:'Advanced Mass Production',pillar:'industry',effect:'Ein weiterer Manufacturing-Job je Level'},
 {id:'45746',name:'Reactions',pillar:'industry',effect:'4% kuerzere Reaction-Zeit je Level; theoretischer Multiplikator'},
 {id:'45748',name:'Mass Reactions',pillar:'industry',effect:'Ein weiterer Reaction-Job je Level'},
 {id:'45749',name:'Advanced Mass Reactions',pillar:'industry',effect:'Ein weiterer Reaction-Job je Level'},
] as const;
export function skillRecords(characterId:string,response:EsiResponse,kind:'skill_snapshot'|'skill_queue'|'character_attributes'|'character_implants'):ProjectRecord[]{
 const data=kind==='skill_snapshot'?SkillSnapshot.parse(response.data):kind==='skill_queue'?{queue:Queue.parse(response.data)}:kind==='character_attributes'?Attributes.parse(response.data):{implants:z.array(id).parse(response.data)};
 return [{kind,source:'esi',sourceClass:'automatic',sourceCharacterId:characterId,sourceEntityId:characterId,fetchedAt:response.fetchedAt,sourceTimestamp:response.sourceTimestamp??response.fetchedAt,dataQuality:'measured',status:'actual',deduplicationKey:'esi:'+characterId+':'+kind,data}];
}
export type Skills=z.infer<typeof SkillSnapshot>;export type SkillQueue=z.infer<typeof Queue>;
export function SkillImpactAnalysis(snapshot:Skills|undefined,queue:SkillQueue|undefined,queueFetchedAt:string|undefined,now=new Date()){
 if(!snapshot)return {rows:[],capacities:null,forecast:null,currentTraining:undefined};
 const active=new Map(snapshot.skills.map(s=>[s.skill_id,s.active_skill_level]));
 const trained=new Map(snapshot.skills.map(s=>[s.skill_id,s.trained_skill_level]));
 const future=new Map(trained);
 for(const q of queue??[]){
  // A cached schedule alone cannot prove completion or the character's active entitlement.
  if(q.finish_date&&queueFetchedAt&&Date.parse(q.finish_date)<=Math.min(now.getTime(),Date.parse(queueFetchedAt)))trained.set(q.skill_id,Math.max(trained.get(q.skill_id)??0,q.finished_level));
  future.set(q.skill_id,Math.max(future.get(q.skill_id)??0,q.finished_level));
 }
 const rows=economicSkills.map(s=>({...s,activeLevel:active.get(s.id)??0,trainedLevel:trained.get(s.id)??0,queueLevel:queue===undefined?null:future.get(s.id)??0,quality:'actual snapshot / queue forecast',iskImpact:'unknown'}));
 const calculate=(levels:Map<string,number>)=>{const l=(id:string)=>levels.get(id)??0;return {maxPlanets:1+l('2495'),commandCenterLevel:l('2505'),orderSlots:5+4*l('3443')+8*l('3444')+16*l('16596')+32*l('18580'),salesTaxPercent:7.5*(1-.11*l('16622')),npcBrokerBeforeStandingsPercent:3-.3*l('3446'),relistDiscountPercent:50+6*l('16597'),manufacturingJobSlots:1+l('3387')+l('24625'),reactionJobSlots:1+l('45748')+l('45749'),manufacturingTimeMultiplier:1-.04*l('3380'),reactionTimeMultiplier:1-.04*l('45746')};};
 const currentTraining=(queue??[]).find(q=>q.start_date&&q.finish_date&&Date.parse(q.start_date)<=now.getTime()&&Date.parse(q.finish_date)>now.getTime());
 return {rows,capacities:calculate(active),forecast:queue===undefined?null:calculate(future),currentTraining};
}
