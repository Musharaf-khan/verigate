import {NextResponse} from 'next/server';
import {initiate,licenseStatus} from '../../../lib/credence';
import {summarizeRequest} from '../../../lib/inspect';
export const runtime='nodejs';
export const dynamic='force-dynamic';

// Runs the real Credence calls and returns a decoded, token-free view of the request sent to the wallet.
export async function POST(){
 const steps:{name:string;endpoint:string;ms:number;detail:string}[]=[];
 try{
  let t=performance.now();
  const lic=await licenseStatus();
  steps.push({name:lic.reused?'License active':'License activated',endpoint:'POST /v1/setup',ms:Math.round(performance.now()-t),detail:`Access token valid for ${Math.round(lic.expiresInSec/60)} min, bound to ${lic.origin}.`});
  t=performance.now();
  const r=await initiate();
  if(!r.dcRequest?.deviceRequest||!r.dcRequest?.encryptionInfo)throw new Error('Cloud SDK returned an incomplete credential request.');
  steps.push({name:'Credential request created',endpoint:'POST /v1/getDocRequest',ms:Math.round(performance.now()-t),detail:`Session ${String(r.sessionId).slice(0,8)}…, ${r.dcRequest.deviceRequest.length} character signed DeviceRequest.`});
  t=performance.now();
  const summary=summarizeRequest(r.dcRequest);
  steps.push({name:'Request decoded',endpoint:'ISO 18013-5 CBOR',ms:Math.round(performance.now()-t),detail:`DeviceRequest version ${summary.version}, ${summary.documents.length} document request(s).`});
  return NextResponse.json({ok:true,ranAt:new Date().toISOString(),steps,summary});
 }catch(e){
  return NextResponse.json({ok:false,steps,error:e instanceof Error?e.message:'Live check failed.'},{status:502});
 }
}
