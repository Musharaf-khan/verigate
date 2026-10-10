'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Verdict = 'eligible' | 'ineligible' | 'unknown';
type Source = 'Demo' | 'Wallet';

type Entry = {
  id: string;
  when: string;
  source: Source;
  verdict: Verdict;
};

type Result = {
  status: string;
  verdict?: Verdict;
  issuerVerified?: boolean;
  mode?: string;
  message?: string;
};

type Session = {
  sessionId: string;
  dcRequest: { deviceRequest: string; encryptionInfo: string };
  preparedAt: number;
};

// Requests are prepared ahead of time so navigator.credentials.get() runs directly
// inside the button tap. Safari rejects the call if a network request happens first.
const SESSION_TTL_MS = 2 * 60 * 1000;

function walletErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'AbortError':
        return 'The wallet request was closed before an ID was shared. Use Safari on an iPhone with iOS 26 or later, and keep this page open while Wallet is showing.';
      case 'NotAllowedError':
        return 'The request was declined or cancelled in the wallet.';
      case 'NotSupportedError':
        return 'This browser does not support digital ID requests.';
      case 'TypeError':
        return 'The browser rejected the request format.';
      default:
        return `${err.name}: ${err.message}`;
    }
  }
  if (err instanceof TypeError) return 'The browser rejected the request format.';
  return err instanceof Error ? err.message : 'Something went wrong.';
}

export default function Home() {
  const [tab, setTab] = useState<'verify' | 'activity' | 'about'>('verify');
  const [mode, setMode] = useState<'live' | 'demo'>('live');
  const [scenario, setScenario] = useState<Verdict>('eligible');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [supported, setSupported] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [errorTitle, setErrorTitle] = useState('');
  const [history, setHistory] = useState<Entry[]>([]);
  const preparingRef = useRef(false);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'DigitalCredential' in window);
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setConfigured(Boolean(d.configured)))
      .catch(() => setConfigured(false));
  }, []);

  const prepare = useCallback(async () => {
    if (preparingRef.current) return;
    preparingRef.current = true;
    setPreparing(true);
    try {
      const res = await fetch('/api/start', { method: 'POST', cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw Error(body.error || 'Could not prepare the verification request.');
      if (!body.sessionId || typeof body.dcRequest?.deviceRequest !== 'string' || typeof body.dcRequest?.encryptionInfo !== 'string') {
        throw Error('Credence ID returned an incomplete request.');
      }
      setSession({ ...body, preparedAt: Date.now() });
    } catch (e) {
      setSession(null);
      setErrorTitle('Could not prepare the request');
      setError(e instanceof Error ? e.message : 'Could not prepare the verification request.');
    } finally {
      preparingRef.current = false;
      setPreparing(false);
    }
  }, []);

  // Keep a fresh request ready while live mode is open.
  useEffect(() => {
    if (mode !== 'live' || !configured || tab !== 'verify') return;
    if (!session && !working) prepare();
    const timer = setInterval(() => {
      setSession((s) => (s && Date.now() - s.preparedAt > SESSION_TTL_MS ? null : s));
    }, 10_000);
    return () => clearInterval(timer);
  }, [mode, configured, tab, session, working, prepare]);

  function record(verdict: Verdict, source: Source) {
    setHistory((old) =>
      [{ id: crypto.randomUUID().slice(0, 8).toUpperCase(), when: new Date().toLocaleTimeString(), source, verdict }, ...old].slice(0, 25),
    );
  }

  async function runDemo() {
    setWorking(true);
    setError('');
    setResult(null);
    await new Promise((r) => setTimeout(r, 600));
    setResult({
      status: scenario === 'unknown' ? 'needs_review' : 'verified',
      verdict: scenario,
      mode: 'demo',
      message: 'Sample result. No real credential was checked.',
    });
    record(scenario, 'Demo');
    setWorking(false);
  }

  async function runWallet() {
    const current = session;
    if (!current) return;
    setError('');
    setResult(null);
    setWorking(true);
    // Consume the request immediately; each one is single-use.
    setSession(null);

    try {
      let credential: (Credential & { data?: unknown }) | null;
      try {
        credential = (await navigator.credentials.get({
          digital: { requests: [{ protocol: 'org-iso-mdoc', data: current.dcRequest }] },
          mediation: 'required',
        } as unknown as CredentialRequestOptions)) as (Credential & { data?: unknown }) | null;
      } catch (err) {
        throw Error(walletErrorMessage(err));
      }

      if (!credential || credential.data == null) throw Error('No credential was returned by the wallet.');
      // The spec says data is a string, but Safari returns an object. Credence accepts either serialized.
      const data = typeof credential.data === 'string' ? credential.data : JSON.stringify(credential.data);

      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: current.sessionId, data }),
      });
      const body = await res.json();
      if (!res.ok) throw Error(body.error || 'Verification failed.');
      setResult(body);
      record(body.verdict || 'unknown', 'Wallet');
    } catch (e) {
      setErrorTitle('Verification did not complete');
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setWorking(false);
    }
  }

  function switchMode(next: 'live' | 'demo') {
    setMode(next);
    setResult(null);
    setError('');
  }

  let liveStatus: string;
  let liveReady = false;
  if (configured === null) liveStatus = 'Checking configuration…';
  else if (!configured) liveStatus = 'Credence ID credentials are not configured on the server.';
  else if (!supported) liveStatus = 'This browser cannot request digital IDs. Open this page in Safari on iOS 26 or later.';
  else if (preparing) liveStatus = 'Preparing request…';
  else if (session) {
    liveStatus = 'Ready.';
    liveReady = true;
  } else liveStatus = 'Request not ready.';

  const resultTitle = !result
    ? ''
    : result.verdict === 'eligible'
      ? 'Age 21+ confirmed'
      : result.verdict === 'ineligible'
        ? 'Under 21'
        : result.status === 'cancelled'
          ? 'Cancelled'
          : result.status === 'failed'
            ? 'Not verified'
            : 'Needs manual review';

  const resultTone = result?.verdict === 'eligible' ? 'ok' : result?.verdict === 'ineligible' || result?.status === 'failed' ? 'bad' : 'warn';

  return (
    <div className="page">
      <header className="topbar">
        <div className="wrap topbar-inner">
          <span className="wordmark">VeriGate</span>
          <nav>
            <button className={tab === 'verify' ? 'on' : ''} onClick={() => setTab('verify')}>Verify</button>
            <button className={tab === 'activity' ? 'on' : ''} onClick={() => setTab('activity')}>
              Activity{history.length ? ` (${history.length})` : ''}
            </button>
            <button className={tab === 'about' ? 'on' : ''} onClick={() => setTab('about')}>About</button>
          </nav>
        </div>
      </header>

      <main className="wrap main">
        {tab === 'verify' && (
          <>
            <h1>Age verification</h1>
            <p className="lead">Confirm a customer is 21 or older with the mobile ID in their digital wallet. Only the yes or no result is shown.</p>

            <div className="grid">
              <section className="card">
                <div className="segmented" role="tablist">
                  <button role="tab" aria-selected={mode === 'live'} className={mode === 'live' ? 'on' : ''} onClick={() => switchMode('live')}>
                    Wallet ID
                  </button>
                  <button role="tab" aria-selected={mode === 'demo'} className={mode === 'demo' ? 'on' : ''} onClick={() => switchMode('demo')}>
                    Demo
                  </button>
                </div>

                {mode === 'live' ? (
                  <>
                    <p className="hint">
                      The customer approves the request in Apple Wallet or another compatible wallet. Credence ID checks the issuer signature.
                    </p>
                    <p className={'status ' + (liveReady ? 'ready' : '')}>{liveStatus}</p>
                    <button className="primary" disabled={!liveReady || working} onClick={runWallet}>
                      {working ? 'Waiting for wallet…' : 'Verify with digital wallet'}
                    </button>
                  </>
                ) : (
                  <>
                    <label htmlFor="scenario" className="hint">Sample outcome</label>
                    <select id="scenario" value={scenario} onChange={(e) => setScenario(e.target.value as Verdict)}>
                      <option value="eligible">21 or older</option>
                      <option value="ineligible">Under 21</option>
                      <option value="unknown">Birth date missing</option>
                    </select>
                    <button className="primary" disabled={working} onClick={runDemo}>
                      {working ? 'Running…' : 'Run demo'}
                    </button>
                  </>
                )}

                {error && (
                  <div className="notice bad" role="alert">
                    <strong>{errorTitle}</strong>
                    <p>{error}</p>
                    {mode === 'live' && !session && !preparing && configured && (
                      <button className="link" onClick={() => { setError(''); prepare(); }}>Try again</button>
                    )}
                  </div>
                )}

                {result && (
                  <div className={'notice ' + resultTone} role="status">
                    <strong>{resultTitle}</strong>
                    <p>{result.message}</p>
                    <small>{result.mode === 'live' ? (result.issuerVerified ? 'Verified credential' : 'Live request') : 'Demo result'}</small>
                  </div>
                )}
              </section>

              <aside className="card plain">
                <h2>How it works</h2>
                <ol>
                  <li>VeriGate prepares a signed request with Credence ID.</li>
                  <li>The customer shares their mobile ID from their wallet.</li>
                  <li>Credence ID verifies the credential and its issuer.</li>
                  <li>VeriGate shows whether the customer is 21 or older.</li>
                </ol>
                <p className="fine">Birth dates and other personal details are never sent to the browser or stored.</p>
              </aside>
            </div>
          </>
        )}

        {tab === 'activity' && (
          <>
            <h1>Activity</h1>
            <p className="lead">Checks from this browser session. Nothing is saved after you close the page.</p>
            <section className="card">
              {history.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Type</th>
                      <th>Result</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((x) => (
                      <tr key={x.id}>
                        <td className="mono">{x.id}</td>
                        <td>{x.source}</td>
                        <td>
                          <span className={'tag ' + x.verdict}>
                            {x.verdict === 'eligible' ? '21+' : x.verdict === 'ineligible' ? 'Under 21' : 'Review'}
                          </span>
                        </td>
                        <td>{x.when}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="empty">No checks yet.</p>
              )}
            </section>
          </>
        )}

        {tab === 'about' && (
          <>
            <h1>About</h1>
            <p className="lead">How VeriGate connects to the Credence ID Cloud SDK.</p>
            <section className="card">
              <dl className="endpoints">
                <dt>POST /v1/setup</dt>
                <dd>Activates the license and issues a short-lived access token.</dd>
                <dt>POST /v1/getDocRequest</dt>
                <dd>Creates a signed ISO mdoc request and a session ID.</dd>
                <dt>navigator.credentials.get()</dt>
                <dd>The browser asks the wallet to present the ID (org-iso-mdoc).</dd>
                <dt>POST /v1/verifyDocRequest</dt>
                <dd>Verifies the wallet response. VeriGate returns only the age decision.</dd>
              </dl>
              <p className="fine">
                This is an evaluation build. A production deployment would add authentication, rate limiting, audit storage and a compliance review.{' '}
                <a href="https://credenceid.com/mobile-id/developer-documentation/integration-guide/" target="_blank" rel="noreferrer">
                  Credence ID documentation
                </a>
              </p>
            </section>
          </>
        )}
      </main>

      <footer className="wrap footer">© 2026 VeriGate</footer>
    </div>
  );
}
