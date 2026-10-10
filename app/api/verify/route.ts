import {NextResponse} from 'next/server';
import {verify} from '../../../lib/credence';
import {ageVerdict} from '../../../lib/decision';
export const runtime='nodejs';
export async function POST(request:Request){
 try{
  const {sessionId,data}=await request.json();
  if(typeof sessionId!=='string'||sessionId.length>128||typeof data!=='string'||data.length>1000000||!sessionId||!data)return NextResponse.json({error:'Invalid wallet response.'},{status:400});
  const r=await verify(sessionId,data);
  if(r.cancelled)return NextResponse.json({status:'cancelled',message:r.message||'Wallet cancelled verification.'});
  if(r.res!==true)return NextResponse.json({status:'failed',message:typeof r.resDetails==='string'?r.resDetails.slice(0,180):'Credential could not be verified.'});
  let claims:Record<string,unknown>={};try{claims=JSON.parse(r.resDetails)}catch{}
  // Only return an eligibility decision. Never expose raw date of birth or identity claims to the UI.
  const date=claims.birth_date??claims.birthDate??claims.date_of_birth;
  const verdict=ageVerdict(date);
  return NextResponse.json({status:verdict==='unknown'?'needs_review':'verified',verdict,issuerVerified:true,mode:'live',message:verdict==='unknown'?'Credential authentic, but birth date is unavailable in the configured profile.':'Credential cryptographically verified by Credence ID.'});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Verification failed.'},{status:502})}
}
