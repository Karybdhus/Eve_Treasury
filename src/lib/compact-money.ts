// Approximate formatting only. Financial calculations retain exact decimal strings.
export function compactMoney(value:string|null|undefined){if(value==null)return 'Nicht gemeldet';const n=Number(value),a=Math.abs(n),scale=a>=1e9?1e9:a>=1e6?1e6:1;return (n/scale).toLocaleString('de-DE',{maximumFractionDigits:scale===1?2:3})+(scale===1e9?' Mrd':scale===1e6?' Mio':'')+' ISK';}
