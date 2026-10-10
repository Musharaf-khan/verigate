import {NextResponse} from 'next/server';
export const runtime='nodejs';
export async function GET(){return NextResponse.json({configured:Boolean(process.env.CREDENCE_LICENSE_KEY&&process.env.CREDENCE_PROFILE_ID&&process.env.CREDENCE_ORIGIN),service:'VeriGate',sdk:'Cloud SDK / ISO mdoc',demoMode:true})}
