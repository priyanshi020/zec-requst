// ZIP-316 (Unified Addresses) primitives: BLAKE2b (with personalization), F4Jumble,
// and the receiver container format. Pure bytes in / bytes out; zero dependencies.

// ---------- BLAKE2b (RFC 7693), BigInt implementation, supports personalization ----------
const M64 = (1n << 64n) - 1n;
const IV = [
  0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn, 0x3c6ef372fe94f82bn, 0xa54ff53a5f1d36f1n,
  0x510e527fade682d1n, 0x9b05688c2b3e6c1fn, 0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n,
];
const SIGMA = [
  [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], [14,10,4,8,9,15,13,6,1,12,0,2,11,7,5,3],
  [11,8,12,0,5,2,15,13,10,14,3,6,7,1,9,4], [7,9,3,1,13,12,11,14,2,6,5,10,4,0,15,8],
  [9,0,5,7,2,4,10,15,14,1,11,12,6,8,3,13], [2,12,6,10,0,11,8,3,4,13,7,5,15,14,1,9],
  [12,5,1,15,14,13,4,10,0,7,6,3,9,2,8,11], [13,11,7,14,12,1,3,9,5,0,15,4,8,6,2,10],
  [6,15,14,9,11,3,0,8,12,2,13,7,1,4,10,5], [10,2,8,4,7,6,1,5,15,11,9,14,3,12,13,0],
];
const rotr = (x, n) => ((x >> n) | (x << (64n - n))) & M64;

function word(bytes, off) {
  let w = 0n;
  for (let i = 7; i >= 0; i--) w = (w << 8n) | BigInt(bytes[off + i] ?? 0);
  return w;
}

function compress(h, block, t, last) {
  const m = Array.from({ length: 16 }, (_, i) => word(block, i * 8));
  const v = [...h, ...IV];
  v[12] ^= t & M64;
  if (last) v[14] ^= M64;
  const G = (a, b, c, d, x, y) => {
    v[a] = (v[a] + v[b] + x) & M64; v[d] = rotr(v[d] ^ v[a], 32n);
    v[c] = (v[c] + v[d]) & M64;     v[b] = rotr(v[b] ^ v[c], 24n);
    v[a] = (v[a] + v[b] + y) & M64; v[d] = rotr(v[d] ^ v[a], 16n);
    v[c] = (v[c] + v[d]) & M64;     v[b] = rotr(v[b] ^ v[c], 63n);
  };
  for (let r = 0; r < 12; r++) {
    const s = SIGMA[r % 10];
    G(0, 4, 8, 12, m[s[0]], m[s[1]]);   G(1, 5, 9, 13, m[s[2]], m[s[3]]);
    G(2, 6, 10, 14, m[s[4]], m[s[5]]);  G(3, 7, 11, 15, m[s[6]], m[s[7]]);
    G(0, 5, 10, 15, m[s[8]], m[s[9]]);  G(1, 6, 11, 12, m[s[10]], m[s[11]]);
    G(2, 7, 8, 13, m[s[12]], m[s[13]]); G(3, 4, 9, 14, m[s[14]], m[s[15]]);
  }
  for (let i = 0; i < 8; i++) h[i] ^= v[i] ^ v[i + 8];
}

/** BLAKE2b with digest length `outlen` (1..64) and optional 16-byte personalization. */
export function blake2b(input, outlen = 64, person = new Uint8Array(0)) {
  if (outlen < 1 || outlen > 64) throw new Error('bad blake2b length');
  if (person.length > 16) throw new Error('personalization too long');
  const p = new Uint8Array(16); p.set(person);
  const h = [...IV];
  h[0] ^= 0x01010000n ^ BigInt(outlen);
  h[6] ^= word(p, 0);
  h[7] ^= word(p, 8);
  let off = 0;
  while (input.length - off > 128) {
    compress(h, input.subarray(off, off + 128), BigInt(off + 128), false);
    off += 128;
  }
  const block = new Uint8Array(128);
  block.set(input.subarray(off));
  compress(h, block, BigInt(input.length), true);
  const out = new Uint8Array(64);
  h.forEach((w, i) => { for (let j = 0; j < 8; j++) out[i * 8 + j] = Number((w >> BigInt(8 * j)) & 0xffn); });
  return out.slice(0, outlen);
}

// ---------- F4Jumble (ZIP-316) ----------
const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const xor = (a, b) => a.map((x, i) => x ^ b[i]);

function H(i, u, outLen) {
  const person = new Uint8Array(16); person.set(ascii('UA_F4Jumble_H')); person[13] = i;
  return blake2b(u, outLen, person);
}
function G(i, u, outLen) {
  const out = new Uint8Array(outLen);
  for (let j = 0; j * 64 < outLen; j++) {
    const person = new Uint8Array(16); person.set(ascii('UA_F4Jumble_G'));
    person[13] = i; person[14] = j & 255; person[15] = j >> 8;
    const blk = blake2b(u, 64, person);
    out.set(blk.subarray(0, Math.min(64, outLen - j * 64)), j * 64);
  }
  return out;
}
function split(m) {
  const lL = Math.min(64, Math.floor(m.length / 2));
  return [m.subarray(0, lL), m.subarray(lL), lL];
}
function checkLen(m) {
  if (m.length < 48 || m.length > 4194368) throw new Error('F4Jumble input length out of range');
}

export function f4jumble(m) {
  checkLen(m);
  const [a, b, lL] = split(m);
  const x = xor(b, G(0, a, b.length));
  const y = xor(a, H(0, x, lL));
  const d = xor(x, G(1, y, x.length));
  const c = xor(y, H(1, d, lL));
  return Uint8Array.from([...c, ...d]);
}

export function f4jumbleInv(m) {
  checkLen(m);
  const [c, d, lL] = split(m);
  const y = xor(c, H(1, d, lL));
  const x = xor(d, G(1, y, d.length));
  const a = xor(y, H(0, x, lL));
  const b = xor(x, G(0, a, x.length));
  return Uint8Array.from([...a, ...b]);
}

// ---------- Unified payload container ----------
export const RECEIVER_TYPES = {
  0x00: { name: 'transparent-p2pkh', len: 20, label: 'Transparent (P2PKH)', shielded: false },
  0x01: { name: 'transparent-p2sh', len: 20, label: 'Transparent (P2SH)', shielded: false },
  0x02: { name: 'sapling', len: 43, label: 'Sapling', shielded: true },
  0x03: { name: 'orchard', len: 43, label: 'Orchard', shielded: true },
};

const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const padding = (hrp) => { const p = new Uint8Array(16); p.set(ascii(hrp)); return p; };

function readCompact(bytes, pos) {
  const b = bytes[pos];
  if (b === undefined) throw new Error('truncated receiver encoding');
  if (b < 0xfd) return [b, pos + 1];
  if (b === 0xfd) return [bytes[pos + 1] | (bytes[pos + 2] << 8), pos + 3];
  throw new Error('receiver length too large');
}
function writeCompact(n) {
  return n < 0xfd ? [n] : [0xfd, n & 255, n >> 8];
}

/** Decode raw (still-jumbled) UA bytes. Throws on any ZIP-316 violation. */
export function parseUnifiedBytes(hrp, jumbled) {
  const m = f4jumbleInv(jumbled);
  const pad = m.subarray(m.length - 16);
  if (hex(pad) !== hex(padding(hrp))) throw new Error('padding mismatch (wrong network or corrupted address)');
  const body = m.subarray(0, m.length - 16);
  const receivers = [];
  let pos = 0, prev = -1;
  while (pos < body.length) {
    let tc, len;
    [tc, pos] = readCompact(body, pos);
    [len, pos] = readCompact(body, pos);
    if (pos + len > body.length) throw new Error('receiver overruns payload');
    if (tc <= prev) throw new Error('receivers must be in ascending typecode order without duplicates');
    prev = tc;
    const known = RECEIVER_TYPES[tc];
    if (known && known.len !== len) throw new Error(`${known.label} receiver must be ${known.len} bytes`);
    receivers.push({
      typecode: tc,
      type: known ? known.name : 'unknown',
      label: known ? known.label : `Unknown (typecode ${tc})`,
      shielded: known ? known.shielded : null,
      data: hex(body.subarray(pos, pos + len)),
    });
    pos += len;
  }
  if (!receivers.length) throw new Error('no receivers');
  const has = (n) => receivers.some((r) => r.type === n);
  if (has('transparent-p2pkh') && has('transparent-p2sh')) throw new Error('cannot contain both P2PKH and P2SH receivers');
  if (!receivers.some((r) => r.shielded || r.shielded === null)) throw new Error('unified address must contain a shielded receiver');
  return receivers;
}

/** Build jumbled UA bytes from receivers [{typecode, data: Uint8Array|hex}] (sorted for you). */
export function buildUnifiedBytes(hrp, receivers) {
  const toBytes = (d) => (typeof d === 'string' ? Uint8Array.from(d.match(/../g) || [], (h) => parseInt(h, 16)) : d);
  const out = [];
  for (const r of [...receivers].sort((a, b) => a.typecode - b.typecode)) {
    const data = toBytes(r.data);
    out.push(...writeCompact(r.typecode), ...writeCompact(data.length), ...data);
  }
  out.push(...padding(hrp));
  return f4jumble(Uint8Array.from(out));
}
