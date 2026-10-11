import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {validateReport} from '../src/lib/contracts';
const unknown='not_reported';
const financials={realizedRevenue:unknown,operatingCosts:unknown,internalTransfers:unknown,plexPurchases:unknown};
const base={schemaVersion:'1.0',reportId:'bbbbbbbb-0000-4000-8000-000000000001',pillar:'mining',reportType:'daily',period:{from:'2026-10-05T00:00:00Z',to:'2026-10-05T23:59:59Z'},generatedAt:'2026-10-06T00:00:00Z',source:'agent',status:'actual',currency:'ISK',provenance:'live',notes:'Vorlage: Vor Verwendung ID, Zeitraum, Quelle und Messwerte ersetzen. Nicht automatisch als Seed geladen.'};
const rows=[
{...base,data:{kind:'MiningDailyReport',fleetHours:unknown,output:[],...financials}},
{...base,pillar:'pi',data:{kind:'PiDailyReport',output:[],...financials,pocoCosts:unknown,colonies:unknown,cycles:unknown}},
{...base,pillar:'trading',data:{kind:'TradingDailyReport',...financials,costOfGoodsSold:unknown,brokerFees:unknown,salesTax:unknown,relistCosts:unknown,legacyLiquidationRevenue:unknown,legacyLiquidationCostBasis:unknown,legacyLiquidationFees:unknown,averageCapitalEmployed:unknown}},
{...base,pillar:'supplementary',data:{kind:'SupplementaryIncomeReport',activities:['ratloot','hacking','salvage'],...financials}},
...['01-coordinator','02-trading','03-mining','04-industry'].map(n=>JSON.parse(readFileSync(`seed/${n}.json`,'utf8')))
];
mkdirSync('examples',{recursive:true});
rows.forEach((raw,i)=>{const row=validateReport({...raw,reportId:`bbbbbbbb-0000-4000-8000-${String(i+1).padStart(12,'0')}`});writeFileSync(`examples/${row.data.kind}.json`,JSON.stringify(row,null,2)+'\n');});
