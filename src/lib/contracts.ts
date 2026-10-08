import { z } from 'zod';
import {dateKey,localClock} from './time';

// Numbers are measured facts; explicit strings preserve missing-data semantics.
const amount = z.union([z.number().finite().min(0).max(90_000_000_000_000).multipleOf(0.01), z.enum(['unknown', 'not_reported'])]);
const signed = z.union([z.number().finite().min(-90_000_000_000_000).max(90_000_000_000_000).multipleOf(0.01), z.enum(['unknown', 'not_reported'])]);
const quantity = z.union([z.number().finite().nonnegative(), z.enum(['unknown', 'not_reported'])]);
const count = z.union([z.number().int().nonnegative(), z.enum(['unknown', 'not_reported'])]);
const output = z.strictObject({ item: z.string().min(1).max(100), category: z.enum(['ice', 'ore', 'gas', 'pi', 'other']), quantity: z.number().finite().nonnegative(), unit: z.string().min(1).max(40) });
const financials = { realizedRevenue: amount, operatingCosts: amount, internalTransfers: signed, plexPurchases: amount };
const envelope = {
  schemaVersion: z.literal('1.0'), reportId: z.uuid(),
  period: z.strictObject({ from: z.iso.datetime({ offset: true }), to: z.iso.datetime({ offset: true }) }),
  generatedAt: z.iso.datetime({ offset: true }), source: z.enum(['agent', 'manual', 'motor_market', 'esi', 'buyback', 'dashboard']),
  status: z.enum(['actual', 'plan', 'estimate']), currency: z.literal('ISK'),
  reportingTimezone: z.enum(['UTC','Europe/Berlin']).optional(), derivedNetProfit: signed.optional(), evidenceReferences: z.array(z.string()).optional(), sourceTransactionIds:z.array(z.string()).optional(),
  provenance: z.enum(['live', 'historical_seed']), notes: z.string().max(2000).optional(),
};
export const MiningSessionReportSchema = z.strictObject({ ...envelope, pillar: z.literal('mining'), reportType: z.literal('session'), data: z.strictObject({ kind: z.literal('MiningSessionReport'), sessionId: z.string().min(1).max(120), durationHours: quantity, fleetHours: quantity, output: z.array(output).max(100), ...financials, characters: z.array(z.strictObject({ name: z.string().max(100), outputUnits: quantity, hours: quantity })).max(100).optional() }) });
export const MiningDailyReportSchema = z.strictObject({ ...envelope, pillar: z.literal('mining'), reportType: z.enum(['daily','weekly','transaction_summary','plan']), data: z.strictObject({ kind: z.literal('MiningDailyReport'), fleetHours: quantity, output: z.array(output).max(100), ...financials }) });
export const PiDailyReportSchema = z.strictObject({ ...envelope, pillar: z.literal('pi'), reportType: z.enum(['daily','weekly','transaction_summary','plan']), data: z.strictObject({ kind: z.literal('PiDailyReport'), output: z.array(output).max(100), ...financials, pocoCosts: amount, colonies: count, cycles: count }) });
export const TradingSnapshotReportSchema = z.strictObject({ ...envelope, pillar: z.literal('trading'), reportType: z.enum(['snapshot','plan']), data: z.strictObject({ kind: z.literal('TradingSnapshotReport'), wallet: amount, buyEscrow: amount, openBuyOrders: count, openSellOrders: count, inventoryCostBasis: amount, sellOrderCostBasis: amount, openSellOrderAskValue: amount, reportedCapitalBound:amount.optional() }) });
export const TradingDailyReportSchema = z.strictObject({ ...envelope, pillar: z.literal('trading'), reportType: z.enum(['daily','weekly','transaction_summary','plan']), data: z.strictObject({ kind: z.literal('TradingDailyReport'), ...financials, costOfGoodsSold: amount, brokerFees: amount, salesTax: amount, relistCosts: amount, legacyLiquidationRevenue: amount, legacyLiquidationCostBasis: amount, legacyLiquidationFees: amount, averageCapitalEmployed: amount, legacyLiquidationNet:signed.optional() }) });
export const IndustryStatusReportSchema = z.strictObject({ ...envelope, pillar: z.literal('industry'), reportType: z.enum(['snapshot', 'daily','weekly','plan']), data: z.strictObject({ kind: z.literal('IndustryStatusReport'), operationalStatus: z.enum(['active', 'parked', 'planning']), project: z.string().min(1).max(150), ...financials, jobs: count }) });
export const SupplementaryIncomeReportSchema = z.strictObject({ ...envelope, pillar: z.literal('supplementary'), reportType: z.enum(['daily','weekly','transaction_summary','plan']), data: z.strictObject({ kind: z.literal('SupplementaryIncomeReport'), activities: z.array(z.enum(['ratloot', 'hacking', 'salvage', 'other'])).max(4), ...financials }) });
export const CoordinatorSnapshotSchema = z.strictObject({ ...envelope, pillar: z.literal('coordinator'), reportType: z.enum(['snapshot','plan']), data: z.strictObject({ kind: z.literal('CoordinatorSnapshot'), physicalPlex: count, freeLiquidity: amount, releasedPlexContribution: amount, plexUnitPrice: amount,priceEvidence:z.strictObject({source:z.string().min(1),fetchedAt:z.iso.datetime({offset:true}),quality:z.enum(['actual','estimate'])}).optional() }) });
export const PlexGoalSnapshotSchema=z.strictObject({...envelope,pillar:z.literal('plex_goal'),reportType:z.enum(['snapshot','plan']),data:z.strictObject({kind:z.literal('PlexGoalSnapshot'),physicalPlex:count,iskAllocatedForPlex:amount,plexUnitPrice:amount,priceEvidence:z.strictObject({source:z.string().min(1),fetchedAt:z.iso.datetime({offset:true}),quality:z.enum(['actual','estimate'])}).optional(),sixMonthTargetPlex:count.optional(),twelveMonthTargetPlex:count.optional()})});
export const schemas = { MiningSessionReport: MiningSessionReportSchema, MiningDailyReport: MiningDailyReportSchema, PiDailyReport: PiDailyReportSchema, TradingSnapshotReport: TradingSnapshotReportSchema, TradingDailyReport: TradingDailyReportSchema, IndustryStatusReport: IndustryStatusReportSchema, SupplementaryIncomeReport: SupplementaryIncomeReportSchema, CoordinatorSnapshot: CoordinatorSnapshotSchema, PlexGoalSnapshot:PlexGoalSnapshotSchema };
export const ReportSchema = z.union(Object.values(schemas));
export type MiningSessionReport = z.infer<typeof MiningSessionReportSchema>;
export type MiningDailyReport = z.infer<typeof MiningDailyReportSchema>;
export type PiDailyReport = z.infer<typeof PiDailyReportSchema>;
export type TradingSnapshotReport = z.infer<typeof TradingSnapshotReportSchema>;
export type TradingDailyReport = z.infer<typeof TradingDailyReportSchema>;
export type IndustryStatusReport = z.infer<typeof IndustryStatusReportSchema>;
export type SupplementaryIncomeReport = z.infer<typeof SupplementaryIncomeReportSchema>;
export type CoordinatorSnapshot = z.infer<typeof CoordinatorSnapshotSchema>;
export type Report = z.infer<typeof ReportSchema>;
export type Measure = number | 'unknown' | 'not_reported';

export function validateReport(input: unknown): Report {
  const parsed = ReportSchema.safeParse(input);
  if (!parsed.success) {
    const kind = (input as { data?: { kind?: keyof typeof schemas } } | null)?.data?.kind;
    const specific = kind && Object.hasOwn(schemas,kind) ? schemas[kind].safeParse(input) : parsed;
    const issues = !specific.success ? specific.error.issues : parsed.error.issues;
    throw new Error(issues.map(i => `${i.path.join('.') || 'report'}: ${i.message}`).join('\n'));
  }
  const r = parsed.data;
  if (Date.parse(r.period.to) < Date.parse(r.period.from)) throw new Error('period.to must be on or after period.from');
  if (r.status==='actual' && Date.parse(r.generatedAt) < Date.parse(r.period.to)) throw new Error('Actual generatedAt must be on or after period.to');
  if (r.status === 'actual' && Date.parse(r.period.to) > Date.now()) throw new Error('Actual reports cannot describe future periods');
  if (r.reportType === 'snapshot' && Date.parse(r.period.from) !== Date.parse(r.period.to)) throw new Error('Snapshots require one exact observation time');
  if (r.reportType === 'daily') {
    const from = new Date(r.period.from), to = new Date(r.period.to);
    const timezone=r.reportingTimezone??'UTC';
    if (dateKey(from,timezone) !== dateKey(to,timezone)) throw new Error('Daily reports must cover a single UTC accounting day');
    if(localClock(r.period.from,timezone)!=='00:00:00'||localClock(r.period.to,timezone)!=='23:59:59')throw new Error('Daily aggregates must cover the full UTC day for legacy reports, or full Europe/Berlin day for standard reports');
  }
  if(r.data.kind==='PlexGoalSnapshot'&&typeof r.data.plexUnitPrice==='number'&&r.data.plexUnitPrice<=0)throw new Error('PLEX unit price must be positive');
  if (r.data.kind === 'CoordinatorSnapshot') {
    const { freeLiquidity, releasedPlexContribution, plexUnitPrice } = r.data;
    if (typeof plexUnitPrice === 'number' && plexUnitPrice === 0) throw new Error('data.plexUnitPrice must be greater than zero');
    if (typeof releasedPlexContribution === 'number' && (typeof freeLiquidity !== 'number' || releasedPlexContribution > freeLiquidity)) throw new Error('Released PLEX funds require known freeLiquidity and cannot exceed it');
  }
  if (r.status==='actual' && r.data.kind === 'IndustryStatusReport' && r.data.operationalStatus !== 'active') {
    if (typeof r.data.realizedRevenue === 'number' && r.data.realizedRevenue !== 0) throw new Error('Parked/planning industry cannot report actual revenue');
  }
  return r;
}
