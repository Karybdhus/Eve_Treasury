import {monetaryToken} from './exact-money';
import {parse,isLosslessNumber,isSafeNumber} from 'lossless-json';
const monetaryFields=new Set(['realizedRevenue','operatingCosts','internalTransfers','plexPurchases','derivedNetProfit','netProfit','realizedTradingProfit','grossRevenue','directCosts','costs','grossBuys','grossSales','costOfGoodsSold','brokerFees','salesTax','relistCosts','relistFees','legacyLiquidationRevenue','legacyLiquidationCostBasis','legacyLiquidationFees','legacyLiquidationNet','averageCapitalEmployed','wallet','buyEscrow','escrow','inventoryCostBasis','sellOrderCostBasis','openSellOrderAskValue','reportedCapitalBound','capitalBound','freeLiquidity','releasedPlexContribution','iskAllocatedForPlex','plexUnitPrice','iskPerPlex','pocoCosts','pocoTaxes','importExportCosts','materialCosts','jobFees','structureFees','logisticsCosts']);
export function parseFinancialJson(text:string):unknown{
 return parse(text,(key,value)=>{
  if(!isLosslessNumber(value))return value;
  const token=value.toString();
  return monetaryFields.has(key)?monetaryToken(token)??token:isSafeNumber(token)?Number(token):token;
 });
}
