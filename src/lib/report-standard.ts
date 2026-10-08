import {z} from 'zod';
import {validateReport,type Report,type Measure} from './contracts';
const unknown='not_reported' as const;
const measure=z.union([z.number().finite(),z.enum(['unknown','not_reported'])]);
const money=measure.refine(v=>typeof v!=='number'||(Math.abs(v)<=90_000_000_000_000&&Math.abs(v*100-Math.round(v*100))<0.01),'Money must have at most two decimal places');
const quantity=measure.refine(v=>typeof v!=='number'||v>=0);
const positive=money.refine(v=>typeof v!=='number'||v>=0);
const output=z.object({typeId:z.number().int().nonnegative().safe().optional(),name:z.string().min(1),category:z.enum(['ice','ore','gas']).optional(),quantity:z.number().finite().nonnegative(),unit:z.string().optional(),tier:z.enum(['P0','P1','P2','P3','P4']).optional()}).passthrough();
const quality=z.record(z.string(),z.unknown()).optional();
const common={dataQuality:quality,plexContribution:positive.optional(),notes:z.string().optional()};
const financial={realizedRevenue:positive.optional(),netProfit:money.optional()};
export const standardPayloads={
 miningSession:z.object({...common,sessionId:z.string().min(1),location:z.record(z.string(),z.unknown()).optional(),fleetStart:z.iso.datetime({offset:true}).optional(),fleetEnd:z.iso.datetime({offset:true}).optional(),fleetHours:quantity.optional(),characters:z.array(z.object({name:z.string(),outputQuantity:quantity.optional(),notes:z.string().optional()})).optional(),outputs:z.array(output).optional(),directCosts:positive.optional()}).passthrough(),
 miningDaily:z.object({...common,...financial,sessionIds:z.array(z.string()).optional(),totalFleetHours:quantity.optional(),outputs:z.array(output).optional(),costs:positive.optional(),buybackReference:z.string().optional()}).passthrough(),
 pi:z.object({...common,...financial,characters:z.array(z.unknown()).optional(),colonies:z.array(z.unknown()).optional(),extractionCycles:z.array(z.unknown()).optional(),products:z.array(output).optional(),pocoTaxes:positive.optional(),importExportCosts:positive.optional(),inventorySnapshot:z.array(z.unknown()).optional()}).passthrough(),
 tradingSnapshot:z.object({...common,wallet:positive.optional(),escrow:positive.optional(),openBuyOrders:positive.optional(),openSellOrders:positive.optional(),sellOrdersGross:positive.optional(),inventoryValue:positive.optional(),freeOrderSlots:positive.optional(),capitalBound:positive.optional(),freeLiquidity:positive.optional()}).passthrough(),
 tradingDaily:z.object({...common,grossBuys:positive.optional(),grossSales:positive.optional(),costOfGoodsSold:positive.optional(),operatingCosts:positive.optional(),costBasisVerified:z.boolean().optional(),goodsOrigin:z.enum(['purchased','self_earned','legacy','unknown']).optional(),salesTax:positive.optional(),brokerFees:positive.optional(),relistFees:positive.optional(),realizedTradingProfit:money.optional(),oldInventoryLiquidationNet:money.optional(),internalTransfers:money.optional(),capitalBound:positive.optional(),freeLiquidity:positive.optional(),sourceTransactionIds:z.array(z.union([z.string(),z.number().int().safe()])).optional()}).passthrough(),
 industry:z.object({...common,...financial,operationalStatus:z.enum(['active','parked','planning']),jobs:z.array(z.unknown()).optional(),reactions:z.array(z.unknown()).optional(),materialCosts:positive.optional(),jobFees:positive.optional(),structureFees:positive.optional(),logisticsCosts:positive.optional()}).passthrough(),
 supplementary:z.object({...common,activities:z.array(z.object({category:z.enum(['ratting','hacking','salvage','other']),grossRevenue:positive.optional(),directCosts:positive.optional(),netProfit:money.optional(),sourceTransactionIds:z.array(z.union([z.string(),z.number().int().safe()])).optional()})).optional()}).passthrough(),
 coordinator:z.object({...common,physicalPlex:positive.optional(),freeLiquidity:positive.optional(),capitalBound:positive.optional(),realizedProfitByPillar:z.record(z.string(),money).optional(),plexContributionByPillar:z.record(z.string(),positive).optional(),totalRealizedProfit:money.optional(),plexPrice:z.object({iskPerPlex:positive.optional(),timestamp:z.iso.datetime({offset:true}).optional(),source:z.string().optional()}).optional(),openIssues:z.array(z.string()).optional()}).passthrough(),
 plexGoal:z.object({...common,physicalPlex:positive.optional(),iskAllocatedForPlex:positive.optional(),plexPrice:z.object({iskPerPlex:positive.optional(),timestamp:z.iso.datetime({offset:true}).optional(),source:z.string().optional()}).optional(),sixMonthTargetPlex:positive.optional(),twelveMonthTargetPlex:positive.optional(),releasedContributionSinceLastSnapshot:positive.optional()}).passthrough()
};
export const StandardEnvelope=z.object({schemaVersion:z.literal('1.0'),reportId:z.uuid(),pillar:z.enum(['mining','pi','trading','industry','supplementary','coordinator','plex_goal']),reportType:z.enum(['session','daily','weekly','snapshot','transaction_summary','plan']),period:z.strictObject({from:z.iso.datetime({offset:true}),to:z.iso.datetime({offset:true})}),generatedAt:z.iso.datetime({offset:true}),source:z.enum(['agent','manual','motor_market','esi','buyback','dashboard']),status:z.enum(['actual','plan','estimate']),currency:z.literal('ISK'),provenance:z.enum(['live','historical_seed']).optional(),notes:z.string().optional(),data:z.record(z.string(),z.unknown())}).strict();
export function payloadKey(pillar:string,type:string):keyof typeof standardPayloads{
 if(pillar==='mining')return type==='session'?'miningSession':'miningDaily';
 if(pillar==='trading')return type==='snapshot'?'tradingSnapshot':'tradingDaily';
 return ({pi:'pi',industry:'industry',supplementary:'supplementary',coordinator:'coordinator',plex_goal:'plexGoal'} as const)[pillar as 'pi']??'coordinator';
}
function m(data:Record<string,unknown>,key:string):Measure{
 const quality=data.dataQuality as Record<string,unknown>|undefined,entry=quality?.[key];
 const flag=typeof entry==='string'?entry:typeof entry==='object'&&entry?(entry as {status?:string}).status:undefined;
 if(flag==='unknown'||flag==='not_reported')return flag;
 if(flag==='plan'||flag==='estimate')return 'unknown';
 return typeof data[key]==='number'||data[key]==='unknown'||data[key]==='not_reported'?data[key] as Measure:unknown;
}
function refs(data:Record<string,unknown>):string[]{
 const ids=data.sourceTransactionIds as (string|number)[]|undefined;
 const dq=data.dataQuality as Record<string,unknown>|undefined;
 const references=Array.isArray(dq?.sourceReferences)?dq.sourceReferences.filter((r):r is string=>typeof r==='string'):[];
 return [...(ids??[]).map(String),...references,...(typeof data.buybackReference==='string'?[data.buybackReference]:[])];
}
function traced(data:Record<string,unknown>,key:string):Measure{
 const v=m(data,key);
 // Explicit zero activity is a valid report. Other monetary actuals need supporting references.
 return typeof v==='number'&&(v===0||refs(data).length>0)?v:v==='not_reported'?v:'unknown';
}
export function normalizeImport(input:unknown):{report:Report;contract:string;reportedProfit?:Measure}{
 if(typeof (input as {data?:{kind?:unknown}})?.data?.kind==='string')return {report:validateReport(input),contract:'dashboard-v1'};
 const r=StandardEnvelope.parse(input),key=payloadKey(r.pillar,r.reportType),parsed=standardPayloads[key].parse(r.data),d=parsed as Record<string,unknown>;
 const reportType=r.reportType;
 if(r.status==='actual'&&reportType==='plan')throw new Error('A plan report cannot have actual status');
 if(reportType==='snapshot'&&!['trading','industry','coordinator','plex_goal'].includes(r.pillar))throw new Error('Unsupported snapshot payload for this pillar');
 if(reportType==='session'&&r.pillar!=='mining')throw new Error('Only mining sessions use this reporting contract; other manual sessions use the session view');
 const common={...r,pillar:r.pillar,provenance:r.provenance??'live',reportingTimezone:'Europe/Berlin',evidenceReferences:refs(d),sourceTransactionIds:[...(Array.isArray(d.sourceTransactionIds)?d.sourceTransactionIds:[]),...(Array.isArray(d.activities)?d.activities.flatMap(a=>Array.isArray((a as {sourceTransactionIds?:unknown}).sourceTransactionIds)?(a as {sourceTransactionIds:string[]}).sourceTransactionIds:[]):[])].map(String)};
 const finance={realizedRevenue:m(d,'realizedRevenue'),operatingCosts:unknown,internalTransfers:unknown,plexPurchases:unknown};
 const outputs=(list:unknown,category='other')=>(Array.isArray(list)?list:[]).map(raw=>{const o=raw as z.infer<typeof output>;return {item:o.name,category:o.category==='gas'?'gas':o.category??category,quantity:o.quantity,unit:o.unit??'units'};});
 let data:Record<string,unknown>,reportedProfit:Measure|undefined;
 switch(key){
  case 'miningSession':{
   const start=d.fleetStart as string|undefined,end=d.fleetEnd as string|undefined;
   const duration=start&&end?(Date.parse(end)-Date.parse(start))/3600000:unknown;
   if(typeof duration==='number'&&duration<0)throw new Error('fleetEnd must follow fleetStart');
   data={kind:'MiningSessionReport',sessionId:d.sessionId,durationHours:duration,fleetHours:m(d,'fleetHours'),output:outputs(d.outputs),...finance,operatingCosts:m(d,'directCosts')};break;
  }
  case 'miningDaily':data={kind:'MiningDailyReport',fleetHours:m(d,'totalFleetHours'),output:outputs(d.outputs),...finance,operatingCosts:m(d,'costs')};reportedProfit=traced(d,'netProfit');break;
  case 'pi':data={kind:'PiDailyReport',output:outputs(d.products,'pi'),...finance,operatingCosts:m(d,'importExportCosts'),pocoCosts:m(d,'pocoTaxes'),colonies:Array.isArray(d.colonies)?d.colonies.length:unknown,cycles:Array.isArray(d.extractionCycles)?d.extractionCycles.length:unknown};reportedProfit=traced(d,'netProfit');break;
  case 'tradingSnapshot':data={kind:'TradingSnapshotReport',wallet:m(d,'wallet'),buyEscrow:m(d,'escrow'),openBuyOrders:m(d,'openBuyOrders'),openSellOrders:m(d,'openSellOrders'),inventoryCostBasis:unknown,sellOrderCostBasis:unknown,openSellOrderAskValue:m(d,'sellOrdersGross'),reportedCapitalBound:m(d,'capitalBound')};break;
  case 'tradingDaily':data={kind:'TradingDailyReport',...finance,realizedRevenue:m(d,'grossSales'),internalTransfers:m(d,'internalTransfers'),operatingCosts:m(d,'operatingCosts'),costOfGoodsSold:d.costBasisVerified===true&&d.goodsOrigin==='purchased'?m(d,'costOfGoodsSold'):'unknown',brokerFees:m(d,'brokerFees'),salesTax:m(d,'salesTax'),relistCosts:m(d,'relistFees'),legacyLiquidationRevenue:unknown,legacyLiquidationCostBasis:unknown,legacyLiquidationFees:unknown,averageCapitalEmployed:unknown,legacyLiquidationNet:traced(d,'oldInventoryLiquidationNet')};reportedProfit=traced(d,'realizedTradingProfit');break;
  case 'industry':data={kind:'IndustryStatusReport',project:typeof d.project==='string'?d.project:'Industry',operationalStatus:d.operationalStatus,jobs:Array.isArray(d.jobs)?d.jobs.length:unknown,...finance,operatingCosts:unknown};reportedProfit=traced(d,'netProfit');if(r.status==='actual'&&d.operationalStatus!=='active'&&typeof reportedProfit==='number'&&reportedProfit>0)throw new Error('Planning industry cannot claim actual profit');break;
  case 'supplementary':{
   const activities=(d.activities??[]) as {category:string;grossRevenue?:Measure;directCosts?:Measure;netProfit?:Measure;sourceTransactionIds?:string[]}[];
   data={kind:'SupplementaryIncomeReport',activities:[...new Set(activities.map(a=>a.category==='ratting'?'ratloot':a.category))],...finance};
   const values=activities.map(a=>traced({...a},'netProfit'));
   reportedProfit=values.length&&values.every(v=>typeof v==='number')?values.reduce<number>((n,v)=>n+(v as number),0):unknown;break;
  }
  case 'coordinator':case 'plexGoal':{
   const price=(d.plexPrice??{}) as {iskPerPlex?:Measure;timestamp?:string;source?:string};
   const unitPrice=price.timestamp&&price.source?price.iskPerPlex??unknown:unknown;
   // Contribution-by-pillar does not prove a currently allocated balance.
   data={kind:'CoordinatorSnapshot',physicalPlex:m(d,'physicalPlex'),freeLiquidity:m(d,'freeLiquidity'),releasedPlexContribution:unknown,plexUnitPrice:unitPrice,priceEvidence:price.timestamp&&price.source?{source:price.source,fetchedAt:price.timestamp,quality:r.status==='actual'?'actual':'estimate'}:undefined};
   if(key==='plexGoal')data={kind:'PlexGoalSnapshot',physicalPlex:m(d,'physicalPlex'),iskAllocatedForPlex:m(d,'iskAllocatedForPlex'),plexUnitPrice:unitPrice,priceEvidence:price.timestamp&&price.source?{source:price.source,fetchedAt:price.timestamp,quality:r.status==='actual'?'actual':'estimate'}:undefined,sixMonthTargetPlex:m(d,'sixMonthTargetPlex'),twelveMonthTargetPlex:m(d,'twelveMonthTargetPlex')};
   break;
  }
 }
 const report=validateReport({...common,data,derivedNetProfit:reportedProfit});
 return {report,contract:'JSON_REPORTING_STANDARD_V1',reportedProfit};
}
