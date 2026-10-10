import 'server-only';
import { X509Certificate } from 'node:crypto';
import { base64url, decodeCbor, embedded, type CborMap, type CborValue } from './cbor';

export type RequestedDocument = { docType: string; namespaces: { name: string; elements: string[] }[] };
export type Signer = { algorithm: string; subject: string; issuer: string; validTo: string; chainLength: number };
export type Check = { label: string; ok: boolean; detail: string };

export type RequestSummary = {
  version: string;
  documents: RequestedDocument[];
  signer: Signer | null;
  encryption: { curve: string; nonceBytes: number } | null;
  checks: Check[];
};

const ALGORITHMS: Record<number, string> = { [-7]: 'ES256 (ECDSA P-256 / SHA-256)', [-35]: 'ES384', [-36]: 'ES512', [-8]: 'EdDSA' };
const CURVES: Record<number, string> = { 1: 'P-256', 2: 'P-384', 3: 'P-521' };

const get = (m: CborValue, k: CborValue) => (m instanceof Map ? m.get(k) : undefined);

function commonName(dn: string) {
  const parts = Object.fromEntries(dn.split('\n').map((l) => l.split('=') as [string, string]));
  return [parts.CN, parts.O].filter(Boolean).join(', ') || dn;
}

function readSigner(coseSign1: CborValue): Signer | null {
  if (!Array.isArray(coseSign1) || coseSign1.length < 4) return null;
  const protectedHeader = coseSign1[0] instanceof Uint8Array && coseSign1[0].length ? decodeCbor(coseSign1[0]) : new Map();
  const alg = get(protectedHeader, 1);
  const x5 = get(coseSign1[1], 33) ?? get(protectedHeader, 33);
  const chain = (x5 instanceof Uint8Array ? [x5] : Array.isArray(x5) ? x5 : []).filter((c): c is Uint8Array => c instanceof Uint8Array);
  if (!chain.length) return { algorithm: ALGORITHMS[alg as number] ?? String(alg), subject: 'Unknown', issuer: 'Unknown', validTo: '', chainLength: 0 };
  const leaf = new X509Certificate(Buffer.from(chain[0]));
  return {
    algorithm: ALGORITHMS[alg as number] ?? String(alg),
    subject: commonName(leaf.subject),
    issuer: commonName(leaf.issuer),
    validTo: new Date(leaf.validTo).toISOString().slice(0, 10),
    chainLength: chain.length,
  };
}

export function summarizeRequest(dcRequest: { deviceRequest: string; encryptionInfo: string }): RequestSummary {
  const request = decodeCbor(base64url(dcRequest.deviceRequest)) as CborMap;
  const docRequests = (get(request, 'docRequests') as CborValue[]) ?? [];

  const documents: RequestedDocument[] = docRequests.map((doc) => {
    const items = embedded(get(doc, 'itemsRequest') as CborValue) as CborMap;
    const ns = (get(items, 'nameSpaces') as CborMap) ?? new Map();
    return {
      docType: String(get(items, 'docType')),
      namespaces: [...ns.entries()].map(([name, elements]) => ({
        name: String(name),
        elements: elements instanceof Map ? [...elements.keys()].map(String) : [],
      })),
    };
  });

  const readerAuth = docRequests.map((d) => get(d, 'readerAuth')).find(Boolean) ?? (get(request, 'readerAuthAll') as CborValue[] | undefined)?.[0];
  const signer = readerAuth ? readSigner(readerAuth) : null;

  let encryption: RequestSummary['encryption'] = null;
  try {
    const info = decodeCbor(base64url(dcRequest.encryptionInfo));
    const params = Array.isArray(info) ? info[1] : undefined;
    const key = get(params as CborValue, 'recipientPublicKey');
    const nonce = get(params as CborValue, 'nonce');
    encryption = { curve: CURVES[get(key as CborValue, -1) as number] ?? 'Unknown', nonceBytes: nonce instanceof Uint8Array ? nonce.length : 0 };
  } catch {}

  const mdl = documents.find((d) => d.docType === 'org.iso.18013.5.1.mDL');
  const mdlElements = mdl?.namespaces.flatMap((n) => n.elements) ?? [];
  const asksAge = mdlElements.some((e) => e === 'age_over_21' || e === 'birth_date');
  const appleSigned = !!signer && /apple/i.test(signer.issuer);

  const checks: Check[] = [
    {
      label: 'Request is signed by the verifier',
      ok: !!signer,
      detail: signer ? `Signed with ${signer.algorithm} by ${signer.subject}.` : 'No reader authentication found.',
    },
    {
      label: 'Encrypted response channel',
      ok: !!encryption && encryption.nonceBytes > 0,
      detail: encryption ? `Wallet encrypts its reply to a fresh ${encryption.curve} key with a ${encryption.nonceBytes}-byte nonce.` : 'Missing encryption info.',
    },
    {
      label: 'Requests the age attribute',
      ok: asksAge,
      detail: asksAge
        ? `Requests ${mdlElements.join(', ')} from the mobile driver's licence.`
        : `Requests ${mdlElements.join(', ') || 'no mDL elements'}. Select a profile that requests age_over_21.`,
    },
    {
      label: 'Single document request',
      ok: documents.length === 1,
      detail: documents.length === 1 ? 'One document type requested.' : `Asks for ${documents.length} documents (${documents.map((d) => d.docType).join(' + ')}). Credence does not yet support multi-document profiles.`,
    },
    {
      label: 'Signer trusted by Apple Wallet',
      ok: appleSigned,
      detail: appleSigned
        ? 'Certificate issued through Apple Business.'
        : `Issued by ${signer?.issuer ?? 'unknown'}. Apple Wallet needs a certificate issued through Apple Business for this domain.`,
    },
  ];

  return { version: String(get(request, 'version') ?? ''), documents, signer, encryption, checks };
}
