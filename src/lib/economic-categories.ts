export const economicCategories=['PI','RATTING','LOOT','MINING','SALVAGE','HACKING','TRADEPROFIT','SERVICE','MISC'] as const;
export type EconomicCategory=typeof economicCategories[number];
export const economicLabels:Record<EconomicCategory,string>={PI:'PI',RATTING:'Ratting',LOOT:'Loot',MINING:'Mining',SALVAGE:'Salvage',HACKING:'Hacking',TRADEPROFIT:'Tradeprofit',SERVICE:'Dienstleistung',MISC:'MISC'};
// Mapping changes presentation only. Unknown evidence remains unclassified.
export function originEconomicCategory(origin:string):EconomicCategory|null{
 const map:Record<string,EconomicCategory>={Mining:'MINING',Ice:'MINING',MINING_ICE:'MINING',ore_ice:'MINING',PI:'PI',pi:'PI',Loot:'LOOT',ratloot:'LOOT',Salvage:'SALVAGE',salvage:'SALVAGE',Hacking:'HACKING',hacking:'HACKING',Trading:'TRADEPROFIT',MISC:'MISC'};
 return map[origin]??null;
}
export function legacyEconomicCategory(category:string):EconomicCategory|null{
 const map:Record<string,EconomicCategory>={BUYBACK_MINING:'MINING',BUYBACK_PI:'PI',BUYBACK_RATLOOT:'LOOT',BUYBACK_SALVAGE:'SALVAGE',BUYBACK_HACKING:'HACKING',RATTING_BOUNTY:'RATTING',ESS_INCOME:'RATTING',TRADING_SALE:'TRADEPROFIT',TRADING_FEE:'TRADEPROFIT',SERVICE_INCOME:'SERVICE',SERVICE_COST:'SERVICE',MISC_INCOME:'MISC',MISC_COST:'MISC'};
 return map[category]??null;
}
