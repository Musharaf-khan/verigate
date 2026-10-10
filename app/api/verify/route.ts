import {NextResponse} from 'next/server';
import {verify} from '../../../lib/credence';
import {ageVerdict, type Verdict} from '../../../lib/decision';
export const runtime='nodejs';

type Identity=Record<string,unknown>;

// Credence returns resDetails as {identity, authentication, documents?}. Collect every identity block.
function identities(details:unknown):Identity[]{
 if(!details||typeof details!=='object')return [];
 const d=details as {identity?:Identity;documents?:{identity?:Identity}[]};
 const list:Identity[]=[];
 if(d.identity)list.push(d.identity);
 if(Array.isArray(d.documents))for(const doc of d.documents)if(doc?.identity)list.push(doc.identity);
 if(!list.length)list.push(details as Identity);
 return list;
}

function decide(list:Identity[]):Verdict{
 for(const id of list){
  const over=id.age_over_21??id.DDK;
  if(over===true||over==='1'||over===1)return 'eligible';
  if(over===false||over==='0'||over===0)return 'ineligible';
 }
 for(const id of list){
  const v=ageVerdict(id.birth_date??id.birthDate??id.date_of_birth);
  if(v!=='unknown')return v;
 }
 return 'unknown';
}

export async function POST(request:Request){
 try{
  const {sessionId,data}=await request.json();
  if(typeof sessionId!=='string'||!sessionId||sessionId.length>128||typeof data!=='string'||!data||data.length>1000000)return NextResponse.json({error:'Invalid wallet response.'},{status:400});
  const r=await verify(sessionId,data);
  if(r.cancelled)return NextResponse.json({status:'cancelled',verdict:'unknown',mode:'live',message:'The wallet presentation was cancelled.'});
  if(r.res!==true)return NextResponse.json({status:'failed',verdict:'unknown',mode:'live',message:'The credential could not be verified. Signature or issuer trust checks did not pass.'});
  let details:unknown={};try{details=typeof r.resDetails==='string'?JSON.parse(r.resDetails):r.resDetails}catch{}
  // Only return a decision. Never expose date of birth or other identity claims to the browser.
  const verdict=decide(identities(details));
  return NextResponse.json({status:verdict==='unknown'?'needs_review':'verified',verdict,issuerVerified:true,mode:'live',message:verdict==='unknown'?'The credential is authentic, but it did not include an age attribute. Check that the Credence profile requests age_over_21 or birth_date.':'Credential verified by Credence ID.'});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Verification failed.'},{status:502})}
}
