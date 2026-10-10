import 'server-only';
const base = process.env.CREDENCE_API_BASE || 'https://credenceid.com/cloudsdk/playground';
type Token = {accessToken:string;refreshToken:string;expiresAt:number};
let token:Token|null=null;
let pending:Promise<string>|null=null;
async function call(path:string, payload?:unknown, accessToken?:string, origin?:string){
 const headers:Record<string,string>={};
 if(payload!==undefined)headers['Content-Type']='application/json';
 if(accessToken)headers.Authorization=`Bearer ${accessToken}`;
 if(origin)headers.Origin=origin;
 const response=await fetch(`${base}${path}`,{method:'POST',headers,body:payload===undefined?undefined:JSON.stringify(payload),cache:'no-store',signal:AbortSignal.timeout(18000)});
 const body=await response.json().catch(()=>({error:'INVALID_RESPONSE'}));
 if(!response.ok)throw new Error(`Credence API ${response.status}: ${String(body.error||body.message||'Request failed').slice(0,130)}`);
 return body;
}
async function acquire(){
 const licenseKey=process.env.CREDENCE_LICENSE_KEY;
 const profileId=process.env.CREDENCE_PROFILE_ID;
 const origin=process.env.CREDENCE_ORIGIN;
 if(!licenseKey||!profileId||!origin)throw new Error('Cloud SDK not configured. Set CREDENCE_LICENSE_KEY, CREDENCE_PROFILE_ID and CREDENCE_ORIGIN.');
 if(token && token.expiresAt>Date.now()+60_000)return token.accessToken;
 if(token?.refreshToken){
  try{const r=await call('/v1/refresh',{refreshToken:token.refreshToken});token={accessToken:r.accessToken,refreshToken:r.refreshToken,expiresAt:Date.now()+r.expiresIn*1000};return token.accessToken;}catch{token=null;}
 }
 const r=await call('/v1/setup',{licenseKey,profileId},undefined,origin);
 token={accessToken:r.accessToken,refreshToken:r.refreshToken,expiresAt:Date.now()+r.expiresIn*1000};
 return token.accessToken;
}
async function getToken(){if(!pending)pending=acquire().finally(()=>{pending=null});return pending}
export async function initiate(){const accessToken=await getToken();return call('/v1/getDocRequest',undefined,accessToken)}
export async function verify(sessionId:string,data:string){const accessToken=await getToken();return call('/v1/verifyDocRequest',{sessionId,data},accessToken)}
