'use client';

import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  Fingerprint,
  Globe2,
  LayoutDashboard,
  LockKeyhole,
  RefreshCw,
  ScanFace,
  ShieldCheck,
  XCircle,
} from 'lucide-react';

type Entry = {
  id: string;
  when: string;
  source: 'SIMULATION' | 'CREDENCE CLOUD SDK';
  verdict: 'eligible' | 'ineligible' | 'unknown';
  status: string;
};

type Result = {
  status: string;
  verdict?: 'eligible' | 'ineligible' | 'unknown';
  issuerVerified?: boolean;
  mode?: string;
  message?: string;
};

export default function Home() {
  const [tab, setTab] = useState<'verify' | 'dashboard' | 'architecture'>('verify');
  const [mode, setMode] = useState<'simulation' | 'live'>('simulation');
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Entry[]>([]);
  const [scenario, setScenario] = useState<'eligible' | 'ineligible' | 'unknown'>('eligible');
  const [configured, setConfigured] = useState(false);

  const [readySession, setReadySession] = useState<{
    sessionId: string;
    dcRequest: {
      deviceRequest: string;
      encryptionInfo: string;
    };
  } | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setConfigured(Boolean(d.configured)))
      .catch(() => {});
  }, []);

  function record(
    verdict: 'eligible' | 'ineligible' | 'unknown',
    status: string,
    source: Entry['source'],
  ) {
    setHistory((old) =>
      [
        {
          id: crypto.randomUUID().slice(0, 8).toUpperCase(),
          when: new Date().toLocaleTimeString(),
          source,
          verdict,
          status,
        },
        ...old,
      ].slice(0, 15),
    );
  }

  async function run() {
    setWorking(true);
    setError('');
    setResult(null);

    try {
      if (mode === 'simulation') {
        await new Promise((r) => setTimeout(r, 850));
        const next: Result = {
          status: scenario === 'unknown' ? 'needs_review' : 'verified',
          verdict: scenario,
          issuerVerified: false,
          mode: 'simulation',
          message: 'Synthetic demonstration only. No wallet or real credential was verified.',
        };
        setResult(next);
        record(scenario, next.status, 'SIMULATION');
        return;
      }

      if (!('credentials' in navigator)) {
        throw Error('This browser does not expose the Credentials API. Use Chrome 141+ or supported Safari.');
      }

      if (!readySession) {
        const start = await fetch('/api/start', {
          method: 'POST',
          cache: 'no-store',
        });

        const session = await start.json();

        if (!start.ok) {
          throw Error(session.error || 'Could not prepare verification.');
        }

        if (
          !session.sessionId ||
          typeof session.dcRequest?.deviceRequest !== 'string' ||
          typeof session.dcRequest?.encryptionInfo !== 'string'
        ) {
          throw Error('Credence ID returned an incomplete document request.');
        }

        setReadySession(session);
        return;
      }

      const session = readySession;

      // Digital Credentials API is newer than current TypeScript's CredentialRequestOptions definition.
      const options = {
        digital: {
          requests: [
            {
              protocol: 'org-iso-mdoc',
              data: {
                deviceRequest: session.dcRequest.deviceRequest,
                encryptionInfo: session.dcRequest.encryptionInfo,
              },
            },
          ],
        },
        mediation: 'required',
      };

      let credential: Credential | null;

      try {
        console.log('Starting Apple Wallet credential request');

        credential = await navigator.credentials.get(
          options as unknown as CredentialRequestOptions,
        );

        console.log('Wallet returned a credential:', !!credential);
      } catch (err) {
        if (err instanceof DOMException) {
          console.error('Wallet error:', {
            name: err.name,
            message: err.message,
          });
        }
        throw err;
      }

      if (!credential) throw Error('Wallet request was cancelled or no credential was returned.');
      const walletData = (credential as Credential & { data?: string }).data;
      if (!walletData) throw Error('Wallet returned no Digital Credentials payload.');

      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId, data: walletData }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'SDK verification failed.');

      setResult(data);
      record(data.verdict || 'unknown', data.status, 'CREDENCE CLOUD SDK');
      setReadySession(null);
    } catch (e) {
      setReadySession(null);
      setError(e instanceof Error ? e.message : 'Unknown failure.');
    } finally {
      setWorking(false);
    }
  }

  const verified = history.filter(
    (x) => x.source === 'CREDENCE CLOUD SDK' && x.status === 'verified',
  ).length;

  const currentTabLabel =
    tab === 'verify' ? 'Verification studio' : tab === 'dashboard' ? 'Dashboard' : 'Integration overview';

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <ShieldCheck size={23} />
          </div>
          <div>
            veri<span>gate</span>
            <small>IDENTITY PLATFORM</small>
          </div>
        </div>
        <div className="side-label">WORKSPACE</div>
        <button className={`nav ${tab === 'verify' ? 'active' : ''}`} onClick={() => setTab('verify')}>
          <ScanFace size={18} /> Verification studio <ChevronRight size={16} className="arrow" />
        </button>
        <button className={`nav ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>
          <LayoutDashboard size={18} /> Dashboard
        </button>
        <button className={`nav ${tab === 'architecture' ? 'active' : ''}`} onClick={() => setTab('architecture')}>
          <Fingerprint size={18} /> Integration
        </button>
        <div className="side-bottom">
          <div className="side-bottom-head">
            <span className="pulse" /> Evaluation environment
          </div>
          <p>Credence ID Cloud SDK</p>
          <div className="pill muted">SDK integration prepared</div>
        </div>
      </aside>

      <main className="main">
        <header>
          <div className="breadcrumbs">
            Workspace <ChevronRight size={13} /> <strong>{currentTabLabel}</strong>
          </div>
          <div className="header-right">
            <span className="secure">
              <LockKeyhole size={14} /> Privacy-first prototype
            </span>
            <div className="avatar">VG</div>
          </div>
        </header>

        <div className="content">
          {tab === 'verify' && (
            <>
              <div className="heading">
                <div>
                  <div className="eyebrow">DIGITAL TRUST, MADE SIMPLE</div>
                  <h1>
                    Verify with confidence<span>.</span>
                  </h1>
                  <p>Prove age eligibility with a wallet credential, without collecting an ID image.</p>
                </div>
                <div className="flag">
                  <span className="pulse" /> Evaluation prototype
                </div>
              </div>

              <div className="hero">
                <div className="hero-left">
                  <div className="hero-kicker">
                    <ShieldCheck size={15} /> POWERED BY CREDENCE ID
                  </div>
                  <h2>
                    Know who qualifies.
                    <br />
                    <em>Not everything about them.</em>
                  </h2>
                  <p>
                    Digital credential verification with a simple age eligibility decision and a privacy-conscious experience.
                  </p>
                  <div className="hero-tags">
                    <span>
                      <CheckCircle2 size={15} /> Credential validation
                    </span>
                    <span>
                      <LockKeyhole size={15} /> Minimal disclosure
                    </span>
                  </div>
                </div>

                <div className="hero-art">
                  <div className="orbit">
                    <div className="mini-orbit">
                      <Fingerprint size={65} strokeWidth={1.3} />
                    </div>
                  </div>
                  <div className="floating-badge">
                    <CheckCircle2 size={18} /> Trusted verification
                  </div>
                </div>
              </div>

              <div className="workspace-grid">
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <div className="step-tag">01 / VERIFY</div>
                      <h3>New verification</h3>
                      <p>Choose an environment and start a verification session.</p>
                    </div>
                    <ShieldCheck size={23} className="soft-icon" />
                  </div>

                  <div className="field-title">VERIFICATION MODE</div>
                  <div className="mode-grid">
                    <button
                      onClick={() => {
                        setMode('simulation');
                        setResult(null);
                        setError('');
                        setReadySession(null);
                      }}
                      className={'mode ' + (mode === 'simulation' ? 'selected' : '')}
                    >
                      <div className="mode-top">
                        <span className="mode-icon">◈</span>
                        {mode === 'simulation' && <CheckCircle2 size={17} />}
                      </div>
                      <strong>Demo simulation</strong>
                      <small>Interactive sample outcomes</small>
                    </button>
                    <button
                      onClick={() => {
                        setMode('live');
                        setResult(null);
                        setError('');
                        setReadySession(null);
                      }}
                      className={'mode ' + (mode === 'live' ? 'selected' : '')}
                    >
                      <div className="mode-top">
                        <Globe2 size={21} />
                        {mode === 'live' && <CheckCircle2 size={17} />}
                      </div>
                      <strong>Live credential</strong>
                      <small>Credence ID Cloud SDK</small>
                    </button>
                  </div>

                  {mode === 'simulation' ? (
                    <div className="scenario">
                      <label htmlFor="scenario">DEMO TEST CASE</label>
                      <select
                        id="scenario"
                        value={scenario}
                        onChange={(e) => setScenario(e.target.value as typeof scenario)}
                      >
                        <option value="eligible">Adult meets age 21 threshold</option>
                        <option value="ineligible">Under age 21 threshold</option>
                        <option value="unknown">Missing birth date (manual review)</option>
                      </select>
                      <p>
                        <AlertCircle size={14} /> Synthetic test only. This does not validate an identity.
                      </p>
                    </div>
                  ) : (
                    <div className="scenario">
                      <div className="live-line">
                        <span className={configured ? 'green-dot' : 'amber-dot'} />
                        {configured ? 'SDK environment variables detected' : 'SDK configuration missing'}
                      </div>
                      <p>
                        Requires the registered HTTPS origin, a supported browser, and a genuine digital ID in a compatible wallet.
                      </p>
                    </div>
                  )}

                  <button disabled={working} onClick={run} className="primary">
                    {working ? (
                      <>
                        <RefreshCw className="spin" size={18} />{' '}
                        {mode === 'live' ? 'Requesting digital credential...' : 'Running scenario...'}
                      </>
                    ) : (
                      <>
                        {mode === 'live'
                          ? readySession
                            ? 'Present my Apple Wallet ID'
                            : 'Prepare verification'
                          : 'Run demo verification'}
                        <ArrowRight size={18} />
                      </>
                    )}
                  </button>

                  {error && (
                    <div className="error">
                      <AlertCircle size={17} />
                      <div>
                        <strong>Verification couldn't complete</strong>
                        <p>{error}</p>
                      </div>
                    </div>
                  )}

                  {result && (
                    <div
                      className={'result ' + (result.verdict === 'eligible' ? 'success' : result.verdict === 'ineligible' ? 'denied' : 'review')}
                    >
                      <div className="result-title">
                        {result.verdict === 'eligible' ? (
                          <CheckCircle2 size={25} />
                        ) : result.verdict === 'ineligible' ? (
                          <XCircle size={25} />
                        ) : (
                          <AlertCircle size={25} />
                        )}
                        <strong>
                          {result.verdict === 'eligible'
                            ? 'Age eligibility confirmed'
                            : result.verdict === 'ineligible'
                              ? 'Not eligible for age 21+'
                              : result.status === 'cancelled'
                                ? 'Wallet cancelled'
                                : 'Manual review required'}
                        </strong>
                      </div>
                      <p>{result.message}</p>
                      <div className="result-footer">
                        <span>{result.mode === 'live' ? 'LIVE SDK RESPONSE' : 'SIMULATED RESULT'}</span>
                        <span>{result.issuerVerified ? 'Issuer checks passed' : 'No credential validated'}</span>
                      </div>
                    </div>
                  )}
                </section>

                <section className="panel detail-panel">
                  <div className="panel-head">
                    <div>
                      <div className="step-tag">02 / HOW IT WORKS</div>
                      <h3>One effortless flow</h3>
                      <p>From identity presentation to a clear decision.</p>
                    </div>
                  </div>

                  <div className="steps">
                    <div className="workflow-step">
                      <div className="number">1</div>
                      <div>
                        <strong>Request verification</strong>
                        <p>Initiate a secure session with the Credence Cloud SDK.</p>
                      </div>
                    </div>
                    <div className="workflow-step">
                      <div className="number">2</div>
                      <div>
                        <strong>Present mobile ID</strong>
                        <p>The browser invokes a compatible digital ID wallet.</p>
                      </div>
                    </div>
                    <div className="workflow-step">
                      <div className="number">3</div>
                      <div>
                        <strong>Validate credential</strong>
                        <p>Credence checks the wallet response and issuer trust.</p>
                      </div>
                    </div>
                    <div className="workflow-step">
                      <div className="number">4</div>
                      <div>
                        <strong>Return a decision</strong>
                        <p>VeriGate returns eligibility or routes missing data to review.</p>
                      </div>
                    </div>
                  </div>

                  <div className="privacy-box">
                    <LockKeyhole size={19} />
                    <div>
                      <strong>Designed for data minimization</strong>
                      <p>The browser gets an eligibility decision, not raw identity attributes.</p>
                    </div>
                  </div>
                </section>
              </div>
            </>
          )}

          {tab === 'dashboard' && (
            <>
              <div className="heading">
                <div>
                  <div className="eyebrow">VERIFICATION ACTIVITY</div>
                  <h1>
                    Operator dashboard<span>.</span>
                  </h1>
                  <p>Review results from this browser session. Nothing is saved to a database.</p>
                </div>
              </div>

              <div className="stats">
                <div>
                  <small>Total attempts</small>
                  <strong>{history.length}</strong>
                  <span>Current page session</span>
                </div>
                <div>
                  <small>Live SDK validations</small>
                  <strong>{verified}</strong>
                  <span>Not simulated</span>
                </div>
                <div>
                  <small>Simulation attempts</small>
                  <strong>{history.filter((x) => x.source === 'SIMULATION').length}</strong>
                  <span>Labeled demo results</span>
                </div>
              </div>

              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Recent checks</h3>
                    <p>Locally displayed, ephemeral records. No personally identifying data stored.</p>
                  </div>
                </div>

                {history.length ? (
                  <div className="tablewrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Session</th>
                          <th>Source</th>
                          <th>Outcome</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((x) => (
                          <tr key={x.id}>
                            <td className="mono">{x.id}</td>
                            <td>{x.source}</td>
                            <td>
                              <span className={'row-status ' + x.verdict}>
                                {x.verdict === 'eligible' ? 'Eligible' : x.verdict === 'ineligible' ? 'Not eligible' : 'Review'}
                              </span>
                            </td>
                            <td>{x.when}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty">
                    <Clock3 size={36} />
                    <h3>No checks yet</h3>
                    <p>Run a sample verification to see your first activity.</p>
                    <button onClick={() => setTab('verify')}>
                      Start verification <ArrowRight size={16} />
                    </button>
                  </div>
                )}
              </section>
            </>
          )}

          {tab === 'architecture' && (
            <>
              <div className="heading">
                <div>
                  <div className="eyebrow">ENGINEERED FOR TRUST</div>
                  <h1>
                    Under the hood<span>.</span>
                  </h1>
                  <p>The actual request path, plus an honest view of the prototype's boundaries.</p>
                </div>
              </div>

              <section className="panel arch">
                <h3>Cloud SDK integration</h3>
                <div className="arch-steps">
                  <div>VeriGate browser</div>
                  <ArrowRight size={18} />
                  <div>Next.js API routes</div>
                  <ArrowRight size={18} />
                  <div>Credence Cloud SDK</div>
                  <ArrowRight size={18} />
                  <div>Mobile ID wallet</div>
                </div>

                <div className="endpoints">
                  <div>
                    <code>POST /v1/setup</code>
                    <span>License activation and short-lived access token</span>
                  </div>
                  <div>
                    <code>POST /v1/getDocRequest</code>
                    <span>Credential request and verification session ID</span>
                  </div>
                  <div>
                    <code>navigator.credentials.get()</code>
                    <span>Browser-mediated presentation with org-iso-mdoc</span>
                  </div>
                  <div>
                    <code>POST /v1/verifyDocRequest</code>
                    <span>Cryptographic verification and minimal eligibility result</span>
                  </div>
                </div>

                <div className="privacy-box">
                  <AlertCircle size={20} />
                  <div>
                    <strong>Prototype limitations</strong>
                    <p>
                      Evaluation only. Production would require authentication, rate limits, durable encrypted audit storage,
                      shared token management, session protection, and compliance review.
                    </p>
                  </div>
                </div>

                <a
                  target="_blank"
                  rel="noreferrer"
                  href="https://credenceid.com/mobile-id/developer-documentation/integration-guide/"
                  className="doc-link"
                >
                  View Credence ID developer documentation <ExternalLink size={15} />
                </a>
              </section>
            </>
          )}
        </div>

        <footer>
          © 2026 VeriGate • Technical evaluation prototype <span>Powered by Credence ID Cloud SDK</span>
        </footer>
      </main>
    </div>
  );
}

