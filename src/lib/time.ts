export const REPORTING_TIMEZONE = 'Europe/Berlin';
const dateFormatters=new Map<string,Intl.DateTimeFormat>();
export function dateKey(value:string|Date, timezone=REPORTING_TIMEZONE) {
  let formatter=dateFormatters.get(timezone);
  if(!formatter){formatter=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'});dateFormatters.set(timezone,formatter);if(dateFormatters.size>64)dateFormatters.delete(dateFormatters.keys().next().value!);}
  const parts=formatter.formatToParts(new Date(value));
  const get=(name:string)=>parts.find(p=>p.type===name)?.value;
  return get('year')+'-'+get('month')+'-'+get('day');
}
export function localClock(value:string,timezone:string) {
  return new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(value));
}
export function freshness(fetchedAt:string,sourceTimestamp?:string,now=Date.now(),maxAgeHours=24) {
  if(!sourceTimestamp)return 'unknown';
  const age=now-Date.parse(sourceTimestamp),fetchAge=now-Date.parse(fetchedAt);
  if(!Number.isFinite(age)||age< -60000)return 'unknown';
  return age>maxAgeHours*3600000||fetchAge>maxAgeHours*3600000?'stale':'recent_snapshot';
}
