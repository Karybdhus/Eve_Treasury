import type {ProjectRecord} from './source-records';
import {totalMoney} from './money';
import {project} from './accounting';
import {dateKey} from './time';
export function industryAnalysis(rows:ProjectRecord[]){
 const jobs=rows.filter(r=>r.kind==='industry_job'),projectJobs=jobs.filter(r=>typeof r.data.start_date==='string'&&dateKey(r.data.start_date)>=project.start&&dateKey(r.data.start_date)<=project.end);
 const knownCosts=projectJobs.filter(r=>typeof r.data.cost==='number').map(r=>(r.data.cost as number).toFixed(2));
 return {active:jobs.filter(r=>r.data.status==='active').length,ready:jobs.filter(r=>r.data.status==='ready').length,delivered:jobs.filter(r=>r.data.status==='delivered').length,projectJobFeesISK:totalMoney(knownCosts),missingJobFees:projectJobs.length-knownCosts.length,netProfitISK:null,reason:'Job installation fees alone do not prove material costs or realized sales. Scheduled completion is not delivery.'};
}
