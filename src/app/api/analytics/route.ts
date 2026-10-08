import {createHash,timingSafeEqual} from 'node:crypto';
import {assertLocalRequest} from '@/lib/esi/config';
import {getDatabase,readReports} from '@/lib/db';
import {readSettings} from '@/lib/settings';
import {projectData} from '@/lib/data-sources';
import {funding,weekly} from '@/lib/accounting';
import {buybackAnalytics,listBuybacks} from '@/lib/buyback';
import {motorAnalytics} from '@/lib/motor-import';
import {buildInsights} from '@/lib/insights';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{assertLocalRequest(request,false);}catch{return Response.json({error:'Loopback host required'},{status:403});}
 const configured=process.env.AGENT_READ_API_KEY??'',provided=request.headers.get('x-dashboard-api-key')??'';
 if(configured.length<32||!timingSafeEqual(createHash('sha256').update(configured).digest(),createHash('sha256').update(provided).digest()))return Response.json({error:'Authorized agent read key required'},{status:401,headers:{'Cache-Control':'no-store'}});
 const db=getDatabase();try{const settings=readSettings(db),reports=readReports(db).map(s=>s.report).filter(r=>r.provenance!=='historical_seed'&&settings.sources[r.source as keyof typeof settings.sources]!==false),rows=projectData(db),buybacks=settings.sources.buyback?listBuybacks(db):[],now=new Date();
 const f=funding(reports,now,settings),motor=motorAnalytics(db,settings.sources.motor_market);return Response.json({schemaVersion:'1.0',generatedAt:now.toISOString(),metricPolicy:'Separate source-specific revenue and net profit; never sum snapshots, transfers or raw transaction mirrors.',funding:{physicalPlex:f.physical,allocatedISK:f.released,freeLiquidity:f.freeLiquidity,plexPrice:f.price,priceStatus:f.priceStatus,equivalentPlex:f.equivalent,daysRemaining:f.days,targets:f.targets},weeklyNetReports:weekly(reports,now),buybackRevenue:buybackAnalytics(buybacks),motorLedger:{revenueISK:motor.revenueISK,verifiedNetSubtotalISK:motor.verifiedNetSubtotalISK,missingCostBasis:motor.missingCostBasis,legacyRevenueISK:motor.legacyRevenueISK},insights:buildInsights(reports,rows,buybacks,now)},{headers:{'Cache-Control':'no-store'}});
 }finally{db.close();}
}
