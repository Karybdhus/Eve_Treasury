import {validateReport,type Report} from './contracts';
// Future ESI and Motor Market producers use the same boundary as manual imports.
// Credentials and account actions intentionally do not belong in this interface.
export interface ReportProducer {
  readonly source: Report['source'];
  collect(): Promise<unknown[]>;
}
export async function collectValidated(producer:ReportProducer):Promise<Report[]>{
  return (await producer.collect()).map(raw=>{
    const report=validateReport(raw);
    if(report.source!==producer.source)throw new Error('Producer source does not match report source');
    return report;
  });
}
