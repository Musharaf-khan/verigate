import {NextResponse} from 'next/server';
import {initiate} from '../../../lib/credence';
export const runtime='nodejs';
export async function POST(){try{const r=await initiate();if(!r.sessionId||!r.dcRequest?.deviceRequest)throw new Error('Cloud SDK returned an incomplete credential request');return NextResponse.json({sessionId:r.sessionId,dcRequest:r.dcRequest});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not start verification'}, {status:502})}}
