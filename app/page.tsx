'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Integration from './Integration';

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
  const name = err instanceof DOMException ? err.name : err instanceof TypeError ? 'TypeError' : '';
  switch (name) {
    case 'AbortError':
      return 'The ID request closed before anything was shared. Please try again, and keep this page open until your phone asks you to share.';
    case 'NotAllowedError':
      return 'The request was cancelled on the phone. Nothing was shared. You can try again.';
    case 'NotSupportedError':
    case 'TypeError':
      return 'This phone or browser cannot share an ID yet. Use an iPhone with Safari, updated to iOS 26 or later.';
  }
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}

export default function Home() {
  const [tab, setTab] = useState<'verify' | 'activity' | 'integration'>('verify');
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
      setErrorTitle('We couldn\'t get ready');
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
      message: 'This was a practice run. No real ID was checked.',
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

      if (!credential || credential.data == null) throw Error('No ID was shared. Please try again.');
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
      setErrorTitle('The check didn\'t finish');
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
  if (configured === null) liveStatus = 'Getting ready…';
  else if (!configured) liveStatus = 'This service is not set up yet. Please try Practice instead.';
  else if (!supported) liveStatus = 'This browser can\'t share an ID. Open this page in Safari on an iPhone (iOS 26 or later), or try Practice.';
  else if (preparing) liveStatus = 'Getting ready… this takes a few seconds.';
  else if (session) {
    liveStatus = 'Ready. Tap the button below.';
    liveReady = true;
  } else liveStatus = 'Getting ready…';

  const resultTitle = !result
    ? ''
    : result.verdict === 'eligible'
      ? 'Yes, 21 or older'
      : result.verdict === 'ineligible'
        ? 'No, under 21'
        : result.status === 'cancelled'
          ? 'Cancelled'
          : result.status === 'failed'
            ? 'ID could not be confirmed'
            : 'Please check another way';

  const resultTone = result?.verdict === 'eligible' ? 'ok' : result?.verdict === 'ineligible' || result?.status === 'failed' ? 'bad' : 'warn';
  const resultIcon = resultTone === 'ok' ? '✓' : resultTone === 'bad' ? '✕' : '!';

  return (
    <div className="page">
      <a href="#main" className="skip">Skip to content</a>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <span className="wordmark">VeriGate</span>
          <nav aria-label="Main">
            <button aria-current={tab === 'verify' ? 'page' : undefined} className={tab === 'verify' ? 'on' : ''} onClick={() => setTab('verify')}>Check age</button>
            <button aria-current={tab === 'activity' ? 'page' : undefined} className={tab === 'activity' ? 'on' : ''} onClick={() => setTab('activity')}>
              History{history.length ? ` (${history.length})` : ''}
            </button>
            <button aria-current={tab === 'integration' ? 'page' : undefined} className={tab === 'integration' ? 'on' : ''} onClick={() => setTab('integration')}>Technical</button>
          </nav>
        </div>
      </header>

      <main id="main" className="wrap main">
        {tab === 'verify' && (
          <>
            <h1>Check age with a phone ID</h1>
            <p className="lead">Show you are 21 or older using the driver’s license on your phone. We only see “yes” or “no”, never your birthday, address or photo.</p>

            <div className="grid">
              <section className="card">
                <p className="choose" id="mode-label">How do you want to check?</p>
                <div className="choice" role="radiogroup" aria-labelledby="mode-label">
                  <button role="radio" aria-checked={mode === 'live'} className={mode === 'live' ? 'on' : ''} onClick={() => switchMode('live')}>
                    <strong>Use my phone ID</strong>
                    <span>Real check with your phone</span>
                  </button>
                  <button role="radio" aria-checked={mode === 'demo'} className={mode === 'demo' ? 'on' : ''} onClick={() => switchMode('demo')}>
                    <strong>Practice</strong>
                    <span>See how it works, no ID needed</span>
                  </button>
                </div>

                {mode === 'live' ? (
                  <>
                    <ol className="howto">
                      <li>Tap <b>Check my age</b>.</li>
                      <li>Your phone asks if you want to share. Check the details, then confirm.</li>
                      <li>Your answer appears on this screen.</li>
                    </ol>
                    <p className={'status ' + (liveReady ? 'ready' : '')} aria-live="polite">{liveStatus}</p>
                    <button className="primary" disabled={!liveReady || working} onClick={runWallet}>
                      {working ? 'Waiting for your phone…' : 'Check my age'}
                    </button>
                  </>
                ) : (
                  <>
                    <label htmlFor="scenario" className="field-label">Pick a practice answer</label>
                    <select id="scenario" value={scenario} onChange={(e) => setScenario(e.target.value as Verdict)}>
                      <option value="eligible">Person is 21 or older</option>
                      <option value="ineligible">Person is under 21</option>
                      <option value="unknown">Birthday is missing from the ID</option>
                    </select>
                    <button className="primary" disabled={working} onClick={runDemo}>
                      {working ? 'Checking…' : 'Start practice'}
                    </button>
                  </>
                )}

                {error && (
                  <div className="notice bad" role="alert">
                    <span className="big-icon" aria-hidden="true">!</span>
                    <div>
                      <strong>{errorTitle}</strong>
                      <p>{error}</p>
                      {mode === 'live' && !session && !preparing && configured && (
                        <button className="secondary" onClick={() => { setError(''); prepare(); }}>Try again</button>
                      )}
                    </div>
                  </div>
                )}

                {result && (
                  <div className={'notice ' + resultTone} role="status" aria-live="polite">
                    <span className="big-icon" aria-hidden="true">{resultIcon}</span>
                    <div>
                      <strong>{resultTitle}</strong>
                      <p>{result.message}</p>
                      <small>{result.mode === 'live' ? (result.issuerVerified ? 'Real ID, confirmed by the issuing state' : 'Real check') : 'Practice result'}</small>
                    </div>
                  </div>
                )}
              </section>

              <aside className="card plain">
                <h2>Good to know</h2>
                <ul className="facts-list">
                  <li><b>Private.</b> Staff only see yes or no. Your birthday, address and photo aren’t shown or saved.</li>
                  <li><b>Your choice.</b> Your phone asks you before sharing anything.</li>
                  <li><b>Checked.</b> Credence ID checks that the ID came from the state that issued it.</li>
                </ul>
                <p className="fine">Real phone ID checks are still being set up with Apple. Practice mode works today.</p>
              </aside>
            </div>
          </>
        )}

        {tab === 'activity' && (
          <>
            <h1>History</h1>
            <p className="lead">Checks done on this screen. They disappear when you close the page.</p>
            <section className="card">
              {history.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Result</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((x) => (
                      <tr key={x.id}>
                        <td>{x.when}</td>
                        <td>
                          <span className={'tag ' + x.verdict}>
                            {x.verdict === 'eligible' ? '✓ 21 or older' : x.verdict === 'ineligible' ? '✕ Under 21' : '! Check another way'}
                          </span>
                        </td>
                        <td>{x.source === 'Demo' ? 'Practice' : 'Phone ID'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty">
                  <p>No checks yet.</p>
                  <button className="secondary" onClick={() => setTab('verify')}>Check an age</button>
                </div>
              )}
            </section>
          </>
        )}

        {tab === 'integration' && <Integration />}
      </main>

      <footer className="wrap footer">© 2026 VeriGate</footer>
    </div>
  );
}
