'use client';

import { useState } from 'react';

type Step = { name: string; endpoint: string; ms: number; detail: string };
type Check = { label: string; ok: boolean; detail: string };
type Report = {
  ok: boolean;
  ranAt?: string;
  error?: string;
  steps: Step[];
  summary?: {
    version: string;
    documents: { docType: string; namespaces: { name: string; elements: string[] }[] }[];
    signer: { algorithm: string; subject: string; issuer: string; validTo: string; chainLength: number } | null;
    encryption: { curve: string; nonceBytes: number } | null;
    checks: Check[];
  };
};

export default function Integration() {
  const [report, setReport] = useState<Report | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const res = await fetch('/api/inspect', { method: 'POST', cache: 'no-store' });
      setReport(await res.json());
    } catch {
      setReport({ ok: false, steps: [], error: 'Could not reach the VeriGate server.' });
    } finally {
      setRunning(false);
    }
  }

  const s = report?.summary;
  const passed = s?.checks.filter((c) => c.ok).length ?? 0;

  return (
    <>
      <h1>Integration</h1>
      <p className="lead">
        Run the real Credence ID calls from the VeriGate server and see exactly what the wallet is asked for.
      </p>

      <section className="card">
        <div className="row">
          <div>
            <h2>Live check</h2>
            <p className="hint flush">Activates the license, creates a signed request and decodes it. No personal data is involved.</p>
          </div>
          <button className="primary inline" onClick={run} disabled={running}>
            {running ? 'Running…' : report ? 'Run again' : 'Run live check'}
          </button>
        </div>

        {report && (
          <ol className="steps">
            {report.steps.map((st) => (
              <li key={st.endpoint}>
                <span className="mark ok">✓</span>
                <div>
                  <strong>{st.name}</strong> <code>{st.endpoint}</code> <span className="ms">{st.ms} ms</span>
                  <p>{st.detail}</p>
                </div>
              </li>
            ))}
            {!report.ok && (
              <li>
                <span className="mark bad">✕</span>
                <div>
                  <strong>Stopped</strong>
                  <p>{report.error}</p>
                </div>
              </li>
            )}
          </ol>
        )}
      </section>

      {s && (
        <>
          <div className="grid two">
            <section className="card">
              <h2>What the wallet is asked for</h2>
              {s.documents.map((d) => (
                <div key={d.docType} className="doc">
                  <code>{d.docType}</code>
                  {d.namespaces.map((n) => (
                    <p key={n.name}>{n.elements.join(', ') || 'No elements'}</p>
                  ))}
                </div>
              ))}
            </section>

            <section className="card">
              <h2>How the request is protected</h2>
              <dl className="facts">
                <dt>Signature</dt>
                <dd>{s.signer?.algorithm ?? 'Not signed'}</dd>
                <dt>Signed by</dt>
                <dd>{s.signer?.subject ?? '—'}</dd>
                <dt>Certificate issuer</dt>
                <dd>{s.signer?.issuer ?? '—'}</dd>
                <dt>Valid until</dt>
                <dd>{s.signer?.validTo || '—'}</dd>
                <dt>Response encryption</dt>
                <dd>{s.encryption ? `${s.encryption.curve} key, ${s.encryption.nonceBytes}-byte nonce` : '—'}</dd>
              </dl>
            </section>
          </div>

          <section className="card">
            <div className="row">
              <h2>Go-live checklist</h2>
              <span className="count">
                {passed} of {s.checks.length} ready
              </span>
            </div>
            <ul className="checklist">
              {s.checks.map((c) => (
                <li key={c.label}>
                  <span className={'mark ' + (c.ok ? 'ok' : 'todo')}>{c.ok ? '✓' : '!'}</span>
                  <div>
                    <strong>{c.label}</strong>
                    <p>{c.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section className="card">
        <h2>Request path</h2>
        <dl className="endpoints">
          <dt>POST /v1/setup</dt>
          <dd>Activates the license for the registered origin and issues a short-lived access token.</dd>
          <dt>POST /v1/getDocRequest</dt>
          <dd>Creates a signed ISO 18013-5 DeviceRequest, encryption parameters and a session ID.</dd>
          <dt>navigator.credentials.get()</dt>
          <dd>Safari asks the wallet to present the ID over the Digital Credentials API (org-iso-mdoc).</dd>
          <dt>POST /v1/verifyDocRequest</dt>
          <dd>Decrypts and verifies the wallet response. VeriGate returns only the age decision.</dd>
        </dl>
        <p className="fine">
          Evaluation build. A production deployment would add operator sign-in, rate limiting, audit storage and a compliance review.{' '}
          <a href="https://credenceid.com/mobile-id/developer-documentation/integration-guide/" target="_blank" rel="noreferrer">
            Credence ID documentation
          </a>
        </p>
      </section>
    </>
  );
}
