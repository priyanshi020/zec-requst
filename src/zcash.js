// zec-request: zero-dependency Zcash address inspection + ZIP-321 payment requests.
// Works unchanged in Node (>=18) and browsers (ES modules).

import { parseUnifiedBytes, buildUnifiedBytes } from './zip316.js';

const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// ---------- Bech32 / Bech32m ----------
function polymod(values) {
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= G[i];
  }
  return chk >>> 0;
}
const hrpExpand = (h) => [...h].map((c) => c.charCodeAt(0) >> 5).concat(0, [...h].map((c) => c.charCodeAt(0) & 31));

/** Decode a bech32/bech32m string (no 90-char limit; Zcash addresses are longer). */
export function bech32Decode(str) {
  if (str !== str.toLowerCase() && str !== str.toUpperCase()) throw new Error('mixed-case bech32');
  str = str.toLowerCase();
  const pos = str.lastIndexOf('1');
  if (pos < 1 || pos + 7 > str.length) throw new Error('invalid bech32 structure');
  const hrp = str.slice(0, pos);
  const data = [];
  for (const c of str.slice(pos + 1)) {
    const v = B32.indexOf(c);
    if (v < 0) throw new Error('invalid bech32 character');
    data.push(v);
  }
  const pm = polymod(hrpExpand(hrp).concat(data));
  const variant = pm === 1 ? 'bech32' : pm === 0x2bc830a3 ? 'bech32m' : null;
  if (!variant) throw new Error('bad checksum');
  return { hrp, variant, data: data.slice(0, -6) };
}

export function fromWords(words) {
  let acc = 0, bits = 0;
  const out = [];
  for (const w of words) {
    acc = (acc << 5) | w;
    bits += 5;
    while (bits >= 8) { bits -= 8; out.push((acc >> bits) & 255); }
    acc &= (1 << bits) - 1;
  }
  if (bits >= 5 || acc) throw new Error('invalid padding');
  return Uint8Array.from(out);
}

export function toWords(bytes) {
  const words = [];
  let acc = 0, bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b; bits += 8;
    while (bits >= 5) { bits -= 5; words.push((acc >> bits) & 31); }
    acc &= (1 << bits) - 1;
  }
  if (bits) words.push((acc << (5 - bits)) & 31);
  return words;
}

/** Encode bytes as Bech32m with the given HRP. */
export function bech32mEncode(hrp, bytes) {
  const words = toWords(bytes);
  const m = polymod(hrpExpand(hrp).concat(words, [0, 0, 0, 0, 0, 0])) ^ 0x2bc830a3;
  const chk = [0, 1, 2, 3, 4, 5].map((i) => (m >>> (5 * (5 - i))) & 31);
  return hrp + '1' + words.concat(chk).map((w) => B32[w]).join('');
}

/** Build a Unified Address from receivers [{typecode, data}] (ZIP-316). network: mainnet|testnet|regtest. */
export function encodeUnified(receivers, network = 'mainnet') {
  const hrp = { mainnet: 'u', testnet: 'utest', regtest: 'uregtest' }[network];
  if (!hrp) throw new Error('unknown network');
  return bech32mEncode(hrp, buildUnifiedBytes(hrp, receivers));
}

// ---------- Base58Check ----------
async function sha256(bytes) {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
}
export async function base58CheckDecode(str) {
  let n = 0n;
  for (const c of str) {
    const v = B58.indexOf(c);
    if (v < 0) throw new Error('invalid base58 character');
    n = n * 58n + BigInt(v);
  }
  let hex = n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  let bytes = hex === '00' ? [] : hex.match(/../g).map((h) => parseInt(h, 16));
  const zeros = [...str].findIndex((c) => c !== '1');
  bytes = Array(zeros < 0 ? str.length : zeros).fill(0).concat(bytes);
  if (bytes.length < 5) throw new Error('too short');
  const payload = Uint8Array.from(bytes.slice(0, -4));
  const check = (await sha256(await sha256(payload))).slice(0, 4);
  if (!check.every((b, i) => b === bytes[bytes.length - 4 + i])) throw new Error('bad checksum');
  return payload;
}

// ---------- Address inspection ----------
const T_PREFIXES = {
  '1cb8': { type: 'transparent-p2pkh', network: 'mainnet' },
  '1cbd': { type: 'transparent-p2sh', network: 'mainnet' },
  '1d25': { type: 'transparent-p2pkh', network: 'testnet' },
  '1cba': { type: 'transparent-p2sh', network: 'testnet' },
};

const INFO = {
  unified: { shielded: true, blurb: 'Unified address (ZIP-316): bundles Orchard, Sapling and/or transparent receivers in one string. Recommended for new payments.' },
  sapling: { shielded: true, blurb: 'Sapling shielded address: private, supports encrypted memos. Older than Unified/Orchard.' },
  'transparent-p2pkh': { shielded: false, blurb: 'Transparent address (t1/tm): public like Bitcoin. Amounts and addresses are visible on-chain. No memos.' },
  'transparent-p2sh': { shielded: false, blurb: 'Transparent script-hash address (t3/t2): public. No memos.' },
  sprout: { shielded: true, blurb: 'Legacy Sprout address (zc): deprecated; avoid.' },
};

/**
 * Classify and checksum-validate an address.
 * NOTE: for unified addresses we validate the outer Bech32m checksum and HRP
 * but do not undo F4Jumble, so receiver contents are not listed.
 */
export async function inspectAddress(addr) {
  addr = String(addr || '').trim();
  const fail = (error) => ({ valid: false, error });
  if (!addr) return fail('empty address');
  try {
    if (/^(u|utest|uregtest)1/i.test(addr)) {
      const d = bech32Decode(addr);
      if (d.variant !== 'bech32m') return fail('unified addresses use Bech32m');
      const network = d.hrp === 'u' ? 'mainnet' : d.hrp === 'utest' ? 'testnet' : d.hrp === 'uregtest' ? 'regtest' : null;
      if (!network) return fail('unknown unified HRP');
      const raw = fromWords(d.data);
      if (raw.length < 48) return fail('unified payload too short');
      const receivers = parseUnifiedBytes(d.hrp, raw);
      const hasMemoPool = receivers.some((r) => r.shielded);
      return { valid: true, type: 'unified', network, ...INFO.unified, shielded: hasMemoPool, receivers };
    }
    if (/^(zs|ztestsapling|zregtestsapling)1/i.test(addr)) {
      const d = bech32Decode(addr);
      if (d.variant !== 'bech32') return fail('sapling addresses use Bech32');
      if (fromWords(d.data).length !== 43) return fail('sapling payload must be 43 bytes');
      const network = d.hrp === 'zs' ? 'mainnet' : d.hrp === 'ztestsapling' ? 'testnet' : 'regtest';
      return { valid: true, type: 'sapling', network, ...INFO.sapling };
    }
    const p = await base58CheckDecode(addr);
    const hex = [...p.slice(0, 2)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (p.length === 22 && T_PREFIXES[hex]) return { valid: true, ...T_PREFIXES[hex], ...INFO[T_PREFIXES[hex].type] };
    if (p.length === 66 && hex === '169a') return { valid: true, type: 'sprout', network: 'mainnet', ...INFO.sprout };
    return fail('unrecognised address format');
  } catch (e) {
    return fail(e.message);
  }
}

// ---------- ZIP-321 ----------
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });

export function memoToParam(text) {
  const bytes = enc.encode(text);
  if (bytes.length > 512) throw new Error(`memo is ${bytes.length} bytes; max is 512`);
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function paramToMemo(p) {
  const b64 = p.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return dec.decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Validate a ZEC amount string: non-negative decimal, <= 8 places, <= 21,000,000. Returns normalised string. */
export function normaliseAmount(a) {
  const s = String(a).trim();
  if (!/^\d+(\.\d{1,8})?$/.test(s)) throw new Error(`invalid amount "${a}" (decimal, max 8 places)`);
  const [i, f = ''] = s.split('.');
  const zats = BigInt(i) * 100000000n + BigInt(f.padEnd(8, '0'));
  if (zats > 2100000000000000n) throw new Error('amount exceeds maximum supply');
  const frac = f.replace(/0+$/, '');
  return String(BigInt(i)) + (frac ? '.' + frac : '');
}

/**
 * Build a ZIP-321 URI. payments: [{address, amount?, memo?, label?, message?}]
 * Memos are rejected for transparent recipients (per ZIP-321).
 */
export async function buildRequest(payments) {
  if (!payments?.length) throw new Error('at least one payment is required');
  const parts = [];
  for (let i = 0; i < payments.length; i++) {
    const p = payments[i];
    const info = await inspectAddress(p.address);
    if (!info.valid) throw new Error(`payment ${i + 1}: ${info.error}`);
    if (p.memo && !info.shielded) throw new Error(`payment ${i + 1}: memos cannot be sent to transparent addresses`);
    const sfx = i === 0 ? '' : `.${i}`;
    const q = [];
    if (i > 0 || payments.length > 1) q.push(`address${sfx}=${encodeURIComponent(p.address)}`);
    if (p.amount !== undefined && p.amount !== '') q.push(`amount${sfx}=${normaliseAmount(p.amount)}`);
    if (p.memo) q.push(`memo${sfx}=${memoToParam(p.memo)}`);
    if (p.label) q.push(`label${sfx}=${encodeURIComponent(p.label)}`);
    if (p.message) q.push(`message${sfx}=${encodeURIComponent(p.message)}`);
    parts.push(q);
  }
  if (payments.length === 1) {
    const q = parts[0];
    return `zcash:${payments[0].address}${q.length ? '?' + q.join('&') : ''}`;
  }
  return 'zcash:?' + parts.flat().join('&');
}

/** Parse a ZIP-321 URI into payments. Throws on malformed input or unknown required (req-) params. */
export async function parseRequest(uri) {
  const m = /^zcash:([^?]*)(?:\?(.*))?$/.exec(String(uri).trim());
  if (!m) throw new Error('not a zcash: URI');
  const map = new Map();
  if (m[1]) map.set(0, { address: decodeURIComponent(m[1]) });
  for (const kv of (m[2] || '').split('&').filter(Boolean)) {
    const eq = kv.indexOf('=');
    const key = eq < 0 ? kv : kv.slice(0, eq);
    const val = eq < 0 ? '' : kv.slice(eq + 1);
    const km = /^([a-z][a-z0-9+-]*)(?:\.(\d+))?$/.exec(key);
    if (!km) throw new Error(`bad parameter "${key}"`);
    const idx = km[2] === undefined ? 0 : Number(km[2]);
    if (km[2] !== undefined && (km[2] === '0' || /^0\d/.test(km[2]))) throw new Error(`bad index in "${key}"`);
    const name = km[1];
    const pay = map.get(idx) || {};
    if (name in pay) throw new Error(`duplicate parameter "${key}"`);
    if (name === 'address') pay.address = decodeURIComponent(val);
    else if (name === 'amount') pay.amount = normaliseAmount(val);
    else if (name === 'memo') pay.memo = paramToMemo(val);
    else if (name === 'label') pay.label = decodeURIComponent(val);
    else if (name === 'message') pay.message = decodeURIComponent(val);
    else if (name.startsWith('req-')) throw new Error(`unsupported required parameter "${name}"`);
    map.set(idx, pay);
  }
  const out = [];
  for (const idx of [...map.keys()].sort((a, b) => a - b)) {
    const p = map.get(idx);
    if (!p.address) throw new Error(`payment ${idx} has no address`);
    const info = await inspectAddress(p.address);
    if (!info.valid) throw new Error(`payment ${idx}: ${info.error}`);
    if (p.memo && !info.shielded) throw new Error(`payment ${idx}: memo on transparent address`);
    out.push({ ...p, addressInfo: { type: info.type, network: info.network, shielded: info.shielded } });
  }
  if (!out.length) throw new Error('no payments');
  return out;
}
