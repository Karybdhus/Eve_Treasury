import {mkdirSync,writeFileSync} from 'node:fs';
import {normalizeImport} from '../src/lib/report-standard';
const u='not_reported';
const base={schemaVersion:'1.0',reportId:'eeeeeeee-0000-4000-8000-000000000001',pillar:'mining',reportType:'daily',period:{from:'2026-10-05T00:00:00+02:00',to:'2026-10-05T23:59:59+02:00'},generatedAt:'2026-10-06T00:00:00+02:00',source:'agent',status:'actual',currency:'ISK',provenance:'historical_seed',notes:'Vorlage, nicht automatisch geladen. Vor Verwendung ID, Zeitraum, provenance und Messwerte ersetzen; kein Ist-Fakt.'};
const rows=[
['MiningSessionReport',{...base,reportType:'session',data:{sessionId:'replace-session-id',fleetHours:u,outputs:[],directCosts:u}}],
['MiningDailyReport',{...base,data:{sessionIds:[],totalFleetHours:u,outputs:[],realizedRevenue:u,costs:u,netProfit:u,plexContribution:u,dataQuality:{netProfit:'not_reported'}}}],
['PiDailyReport',{...base,pillar:'pi',data:{characters:[],colonies:[],extractionCycles:[],products:[],pocoTaxes:u,importExportCosts:u,realizedRevenue:u,netProfit:u,inventorySnapshot:[],plexContribution:u}}],
['TradingSnapshotReport',{...base,pillar:'trading',reportType:'snapshot',period:{from:'2026-10-05T23:59:59+02:00',to:'2026-10-05T23:59:59+02:00'},data:{wallet:u,escrow:u,openBuyOrders:u,openSellOrders:u,sellOrdersGross:u,inventoryValue:u,freeOrderSlots:u,capitalBound:u,freeLiquidity:u}}],
['TradingDailyReport',{...base,pillar:'trading',data:{grossBuys:u,grossSales:u,salesTax:u,brokerFees:u,relistFees:u,realizedTradingProfit:u,oldInventoryLiquidationNet:u,internalTransfers:u,capitalBound:u,freeLiquidity:u,plexContribution:u,sourceTransactionIds:[]}}],
['IndustryStatusReport',{...base,pillar:'industry',reportType:'plan',status:'plan',data:{operationalStatus:'planning',jobs:[],reactions:[],realizedRevenue:u,materialCosts:u,jobFees:u,structureFees:u,logisticsCosts:u,netProfit:u,plexContribution:u}}],
['SupplementaryIncomeReport',{...base,pillar:'supplementary',data:{activities:[{category:'ratting',grossRevenue:u,directCosts:u,netProfit:u,sourceTransactionIds:[]}],plexContribution:u}}],
['CoordinatorSnapshot',{...base,pillar:'coordinator',reportType:'snapshot',period:{from:'2026-10-05T23:59:59+02:00',to:'2026-10-05T23:59:59+02:00'},data:{physicalPlex:u,freeLiquidity:u,capitalBound:u,realizedProfitByPillar:{mining:u,pi:u,trading:u,industry:u,supplementary:u},plexContributionByPillar:{},totalRealizedProfit:u,plexPrice:{iskPerPlex:u},sixMonthTarget:{plex:7875},twelveMonthTarget:{plex:13500},openIssues:['Keine gemessenen Ist-Werte in dieser Vorlage']}}],
['PlexGoalSnapshot',{...base,pillar:'plex_goal',reportType:'snapshot',period:{from:'2026-10-05T23:59:59+02:00',to:'2026-10-05T23:59:59+02:00'},data:{physicalPlex:u,iskAllocatedForPlex:u,plexPrice:{iskPerPlex:u},sixMonthTargetPlex:7875,twelveMonthTargetPlex:13500,releasedContributionSinceLastSnapshot:u}}]
] as [string,Record<string,unknown>][];
mkdirSync('examples/standard',{recursive:true});
rows.forEach(([name,raw],i)=>{raw.reportId='eeeeeeee-0000-4000-8000-'+String(i+1).padStart(12,'0');normalizeImport(raw);writeFileSync('examples/standard/'+name+'.json',JSON.stringify(raw,null,2)+'\n');});
