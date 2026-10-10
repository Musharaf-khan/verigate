import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = {title:'VeriGate | Identity, verified.',description:'Privacy-conscious age eligibility checks using verifiable digital identity credentials.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
