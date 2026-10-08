import {z} from 'zod';
import type {DatabaseSync} from 'node:sqlite';
export const SettingsSchema=z.object({sixMonthPlex:z.number().int().positive().max(1000000),twelveMonthPlex:z.number().int().positive().max(1000000),scenarioLabel:z.string().min(1).max(100),sources:z.object({esi:z.boolean(),motor_market:z.boolean(),buyback:z.boolean(),agent:z.boolean(),manual:z.boolean(),evemon:z.boolean(),google_drive:z.boolean()}).strict()}).strict().refine(s=>s.twelveMonthPlex>=s.sixMonthPlex,'12-month target must cover the 6-month target');
export type Settings=z.infer<typeof SettingsSchema>;
export const defaultSettings:Settings={sixMonthPlex:7875,twelveMonthPlex:13500,scenarioLabel:'Historisches Sale-Szenario',sources:{esi:true,motor_market:true,buyback:true,agent:true,manual:true,evemon:false,google_drive:false}};
export function readSettings(db:DatabaseSync):Settings{const row=db.prepare("SELECT body FROM app_settings WHERE name='project'").get() as {body:string}|undefined;return row?SettingsSchema.parse(JSON.parse(row.body)):defaultSettings;}
export function saveSettings(db:DatabaseSync,input:unknown){const value=SettingsSchema.parse(input);db.prepare("INSERT INTO app_settings VALUES ('project',?,?) ON CONFLICT(name) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at").run(JSON.stringify(value),new Date().toISOString());return value;}
