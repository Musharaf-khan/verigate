export type Verdict='eligible'|'ineligible'|'unknown';
export function ageVerdict(birthDate:unknown,minimum=21,now=new Date()):Verdict {
 if(typeof birthDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(birthDate))return 'unknown';
 const [y,m,d]=birthDate.split('-').map(Number);
 const dt=new Date(Date.UTC(y,m-1,d));
 if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d||dt.getTime()>now.getTime())return 'unknown';
 let age=now.getUTCFullYear()-y;
 if(now.getUTCMonth()+1<m||(now.getUTCMonth()+1===m&&now.getUTCDate()<d))age--;
 return age>=minimum?'eligible':'ineligible';
}
