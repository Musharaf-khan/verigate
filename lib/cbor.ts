// Minimal CBOR decoder (RFC 8949), enough to read ISO 18013-5 DeviceRequest and EncryptionInfo.
export type CborValue = number | bigint | string | boolean | null | undefined | Uint8Array | CborValue[] | CborMap | CborTag;
export type CborMap = Map<CborValue, CborValue>;
export class CborTag { constructor(public tag: number, public value: CborValue) {} }

export function decodeCbor(bytes: Uint8Array): CborValue {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;

  function length(info: number): number {
    if (info < 24) return info;
    if (info === 24) return view.getUint8(pos++);
    if (info === 25) { const v = view.getUint16(pos); pos += 2; return v; }
    if (info === 26) { const v = view.getUint32(pos); pos += 4; return v; }
    if (info === 27) { const v = Number(view.getBigUint64(pos)); pos += 8; return v; }
    if (info === 31) return -1;
    throw new Error('Invalid CBOR length');
  }

  function item(): CborValue {
    const head = view.getUint8(pos++);
    const major = head >> 5;
    const info = head & 31;
    if (major === 7) {
      if (info === 20) return false;
      if (info === 21) return true;
      if (info === 22) return null;
      if (info === 23) return undefined;
      if (info === 25) { const v = view.getUint16(pos); pos += 2; return v; }
      if (info === 26) { const v = view.getFloat32(pos); pos += 4; return v; }
      if (info === 27) { const v = view.getFloat64(pos); pos += 8; return v; }
      return info;
    }
    const len = length(info);
    switch (major) {
      case 0: return len;
      case 1: return -1 - len;
      case 2:
      case 3: {
        let chunk: Uint8Array;
        if (len === -1) {
          const parts: Uint8Array[] = [];
          while (view.getUint8(pos) !== 0xff) parts.push(item() as Uint8Array);
          pos++;
          chunk = Buffer.concat(parts);
          if (major === 3) return parts.join('');
        } else {
          chunk = bytes.subarray(pos, pos + len);
          pos += len;
        }
        return major === 2 ? chunk : new TextDecoder().decode(chunk);
      }
      case 4: {
        const out: CborValue[] = [];
        if (len === -1) { while (view.getUint8(pos) !== 0xff) out.push(item()); pos++; }
        else for (let i = 0; i < len; i++) out.push(item());
        return out;
      }
      case 5: {
        const out: CborMap = new Map();
        if (len === -1) { while (view.getUint8(pos) !== 0xff) out.set(item(), item()); pos++; }
        else for (let i = 0; i < len; i++) out.set(item(), item());
        return out;
      }
      case 6: return new CborTag(len, item());
    }
    throw new Error('Unsupported CBOR item');
  }

  return item();
}

// Unwraps tag 24 (embedded CBOR) when present.
export function embedded(v: CborValue): CborValue {
  if (v instanceof CborTag && v.tag === 24 && v.value instanceof Uint8Array) return decodeCbor(v.value);
  if (v instanceof Uint8Array) return decodeCbor(v);
  return v;
}

export function base64url(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64url'));
}
