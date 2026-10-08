import {z} from 'zod';
import {project} from './accounting';
const Day=z.iso.date();
export const FinancialFilter=z.object({from:Day.default(project.start),to:Day.default(project.end),characterId:z.string().regex(/^\d+$/).optional(),source:z.enum(['buyback','esi','agent','manual','motor_market','dashboard']).optional()}).strict().refine(f=>f.from<=f.to,'Filter start must not exceed end');
export function financialFilter(values:Record<string,unknown>){return FinancialFilter.parse(Object.fromEntries(Object.entries(values).filter(([,v])=>v!==undefined&&v!==null&&v!=='')));}
