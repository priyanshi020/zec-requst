import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeUnified, inspectAddress, buildRequest, parseRequest, memoToParam, paramToMemo, normaliseAmount } from '../src/zcash.js';

// Addresses from the ZIP-321 specification examples.
const SAPLING_TESTNET = 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
const T_TESTNET = 'tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU';

// Official ZIP-316 test vectors (zcash-test-vectors): receivers -> expected UA prefix.
const VECTORS = [
  { p2pkh: '7bb83570b8fae146e03c5331a020b1e0892f631d', sapling: 'd8ef8293d26de832e7193f296ba1922d90f122c6135bc231eebd91efdb03b1a8606771cd4fd6480574d43e',
    ua: 'u1l8xunezsvhq8fgzfl7404m450nwnd76zshscn6nfys7vyz2ywyh4cc5daaq0c7q2su5lqfh23sp7fkf3kt27ve5948mzpfdvckzaect2jtte308mkwlycj2u0eac077wu70vqcetkxf' },
  { p2pkh: 'a7244a362f49f29644a955cf0039b88a61657861', sapling: '435b0bbc95b5b7d52531a3944f2b85603ee22aaf850963bc156eb561edf2cbe7cf0e770e393ae5d7049026',
    ua: 'u1fl5mprj0t9p4jg92hjjy8q5myvwc60c9wv0xachauqpn3c3k4xwzlaueafq27dcg7tzzzaz5jl8tyj93wgs983y0jq0qfhzu6n4r8rakpv5f4gg2lrw4z6pyqqcrcqx04d38yunc6je' },
];
const UA = encodeUnified([{ typecode: 0, data: VECTORS[0].p2pkh }, { typecode: 2, data: VECTORS[0].sapling }]);

test('classifies sapling testnet', async () => {
  const r = await inspectAddress(SAPLING_TESTNET);
  assert.equal(r.valid, true);
  assert.equal(r.type, 'sapling');
  assert.equal(r.network, 'testnet');
  assert.equal(r.shielded, true);
});

test('classifies transparent testnet', async () => {
  const r = await inspectAddress(T_TESTNET);
  assert.equal(r.valid, true);
  assert.equal(r.type, 'transparent-p2pkh');
  assert.equal(r.shielded, false);
});

test('classifies unified and lists receivers', async () => {
  const r = await inspectAddress(UA);
  assert.equal(r.valid, true);
  assert.equal(r.type, 'unified');
  assert.equal(r.network, 'mainnet');
  assert.deepEqual(r.receivers.map((x) => x.type), ['transparent-p2pkh', 'sapling']);
  assert.equal(r.receivers[1].data, VECTORS[0].sapling);
});

test('ZIP-316 vectors: encoder reproduces official addresses; decoder recovers receivers', async () => {
  for (const v of VECTORS) {
    const ua = encodeUnified([{ typecode: 2, data: v.sapling }, { typecode: 0, data: v.p2pkh }]); // unsorted on purpose
    assert.ok(ua.startsWith(v.ua));
    const r = await inspectAddress(v.ua);
    assert.equal(r.valid, true);
    assert.equal(r.receivers[0].data, v.p2pkh);
    assert.equal(r.receivers[1].data, v.sapling);
  }
});

test('unified: wrong network HRP, tampering and bad structure are rejected', async () => {
  const testnetUA = UA.replace(/^u1/, 'utest1');
  assert.equal((await inspectAddress(testnetUA)).valid, false); // checksum/padding mismatch
  const transparentOnly = encodeUnified([{ typecode: 0, data: VECTORS[0].p2pkh }, { typecode: 1, data: VECTORS[0].p2pkh }]);
  assert.match((await inspectAddress(transparentOnly)).error, /both P2PKH and P2SH|shielded/);
  assert.throws(() => encodeUnified([{ typecode: 0, data: VECTORS[0].p2pkh }]), /out of range/); // < 48 bytes: not encodable
});

test('unknown future receiver types are preserved, not rejected', async () => {
  const ua = encodeUnified([{ typecode: 2, data: VECTORS[0].sapling }, { typecode: 0x20, data: '11'.repeat(5) }]);
  const r = await inspectAddress(ua);
  assert.equal(r.valid, true);
  assert.equal(r.receivers[1].type, 'unknown');
});

test('rejects corrupted checksums', async () => {
  assert.equal((await inspectAddress(SAPLING_TESTNET.slice(0, -1) + 'q')).valid, false);
  assert.equal((await inspectAddress(T_TESTNET.slice(0, -1) + '1')).valid, false);
  assert.equal((await inspectAddress(UA.slice(0, -1) + 'q')).valid, false);
  assert.equal((await inspectAddress('')).valid, false);
});

test('amount normalisation', () => {
  assert.equal(normaliseAmount('1.50'), '1.5');
  assert.equal(normaliseAmount('0.00000001'), '0.00000001');
  assert.equal(normaliseAmount('2'), '2');
  assert.throws(() => normaliseAmount('1.123456789'));
  assert.throws(() => normaliseAmount('-1'));
  assert.throws(() => normaliseAmount('1e3'));
  assert.throws(() => normaliseAmount('21000000.00000001'));
});

test('memo base64url round trip incl. unicode', () => {
  const m = 'Thanks for the chai ☕ — मित्र';
  assert.equal(paramToMemo(memoToParam(m)), m);
  assert.throws(() => memoToParam('x'.repeat(513)));
});

test('ZIP-321 memo vector: "This is a simple memo."', () => {
  assert.equal(memoToParam('This is a simple memo.'), 'VGhpcyBpcyBhIHNpbXBsZSBtZW1vLg');
});

test('single payment build/parse round trip', async () => {
  const uri = await buildRequest([{ address: SAPLING_TESTNET, amount: '1.25', memo: 'order #42', label: 'Chai Shop' }]);
  assert.match(uri, /^zcash:ztestsapling1/);
  const [p] = await parseRequest(uri);
  assert.equal(p.address, SAPLING_TESTNET);
  assert.equal(p.amount, '1.25');
  assert.equal(p.memo, 'order #42');
  assert.equal(p.label, 'Chai Shop');
});

test('multi payment build/parse', async () => {
  const uri = await buildRequest([
    { address: SAPLING_TESTNET, amount: '1', memo: 'a' },
    { address: T_TESTNET, amount: '0.5' },
  ]);
  assert.match(uri, /^zcash:\?address=/);
  const ps = await parseRequest(uri);
  assert.equal(ps.length, 2);
  assert.equal(ps[1].address, T_TESTNET);
});

test('memo to transparent address is rejected', async () => {
  await assert.rejects(buildRequest([{ address: T_TESTNET, memo: 'hi' }]), /transparent/);
  await assert.rejects(parseRequest(`zcash:${T_TESTNET}?memo=aGk`), /transparent/);
});

test('parser rejects unknown req- params and duplicates', async () => {
  await assert.rejects(parseRequest(`zcash:${T_TESTNET}?req-future=1`), /required/);
  await assert.rejects(parseRequest(`zcash:${T_TESTNET}?amount=1&amount=2`), /duplicate/);
  await assert.rejects(parseRequest('bitcoin:abc'), /not a zcash/);
});
