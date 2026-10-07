'use client';
import {BarChart,Bar,CartesianGrid,XAxis,YAxis,Tooltip,ResponsiveContainer,Legend,Line,ComposedChart} from 'recharts';
type Row={week:string;mining:number|null;pi:number|null;trading:number|null;industry:number|null;target:number|null};
export function WeeklyChart({rows}:{rows:Row[]}){
  return <div className="chart" role="img" aria-label="Wochengewinn je Saeule und Zieltempo. Fehlende Werte sind Luecken."><ResponsiveContainer width="100%" height="100%"><ComposedChart data={rows}><CartesianGrid stroke="#243342" vertical={false}/><XAxis dataKey="week" stroke="#94a6b6"/><YAxis stroke="#94a6b6" tickFormatter={v=>`${v} M`}/><Tooltip contentStyle={{background:'#121e29',border:'1px solid #314453',borderRadius:8}}/><Legend/><Bar dataKey="mining" name="Mining" stackId="a" fill="#4dd4c6"/><Bar dataKey="pi" name="PI" stackId="a" fill="#6797f5"/><Bar dataKey="trading" name="Trading" stackId="a" fill="#c6a772"/><Bar dataKey="industry" name="Industry" stackId="a" fill="#ad8be8"/><Line dataKey="target" name="Zieltempo 6 Monate (Szenario)" stroke="#e9b76d" strokeDasharray="5 5" connectNulls={false}/></ComposedChart></ResponsiveContainer></div>;
}
export function OutputChart({rows}:{rows:{item:string;quantity:number}[]}){
 return <div className="chart" role="img" aria-label="Mining-Output nach Item"><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} layout="vertical" margin={{left:25,right:20}}><CartesianGrid stroke="#243342" horizontal={false}/><XAxis type="number" stroke="#94a6b6"/><YAxis type="category" dataKey="item" stroke="#94a6b6" width={100}/><Tooltip contentStyle={{background:'#121e29',border:'1px solid #314453'}}/><Bar dataKey="quantity" fill="#4dd4c6" name="Bloecke" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer></div>;
}
