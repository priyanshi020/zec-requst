# zec-request

**Request ZEC the shielded way, and see what's inside any Zcash address.**
A zero-dependency toolkit (library + CLI + web app, English and हिन्दी) for **ZIP-321 payment requests** and **ZIP-316 Unified Address decoding**.

Built for the *Zcash India: Build on Zcash* bounty. Categories: **Education & Adoption** and **Wallets / Better UX**.

> **Live demo:** `<GITHUB_PAGES_LINK>` (see "Deploy the demo" below) · **Video:** `<VIDEO_LINK>`

## The problem

1. **Requesting a payment is clumsy.** People paste a raw address and hope the payer types the right amount and memo. ZIP-321 payment URIs fix this, but few tools make them easy, and the memo (Zcash's killer private-messaging feature) is rarely used.
2. **Unified Addresses are opaque.** A `u1…` address bundles several *receivers* (Orchard, Sapling, transparent) and is deliberately scrambled with F4Jumble, so you can't tell by eye whether it can receive shielded funds or only public ones. Newcomers just have to trust it.

## What it does

- **Decodes Unified Addresses fully (ZIP-316).** It reverses F4Jumble, checks the padding (which also catches wrong-network and corrupted addresses), and lists every receiver (Orchard / Sapling / P2PKH / P2SH / unknown future types), marking each as shielded or **PUBLIC**.
- **Builds ZIP-321 links + QR** with amount, label, message and a memo (UTF-8, ≤ 512 bytes), including multi-recipient requests.
- **Parses** any `zcash:` URI back into readable payments, rejecting malformed input, duplicate params and unknown `req-` params, as the spec requires.
- **Guard rails.** It refuses memos to recipients with no shielded receiver, validates amounts (≤ 8 decimals, ≤ supply), and checksum-validates Unified, Sapling and transparent addresses.
- **Shareable payment page** (`web/pay.html`). Every request becomes a link a payer can open on any device: amount, private memo, QR code, an "Open in wallet" button, and plain warnings (e.g. a Unified address that also holds a PUBLIC receiver). The request lives in the URL *fragment*, which browsers never send to any server.
- **Embeddable "Pay with ZEC" button** (`web/button.js`): one `<script>` tag for any website or blog. See `web/embed-example.html`.
- **Teaches.** Plain-language explanations of each address type, in **English and Hindi**.
- **100% local.** No server, no network calls, no keys. It never touches funds or spending keys.

### What's technically in the box

| Piece | Details |
|---|---|
| `src/zip316.js` | A from-scratch **BLAKE2b** (RFC 7693, personalization and variable output length), **F4Jumble** and its inverse, and the UA receiver container parser/builder. |
| `src/zcash.js` | Bech32/Bech32m (no 90-char limit), Base58Check, address classification, ZIP-321 build/parse, memo codec, UA encoder. Uses only `TextEncoder`, `btoa`/`atob` and WebCrypto SHA-256, so it runs unchanged in Node and browsers. |
| `bin/zec-request.js` | CLI over the library. |
| `web/index.html` | Single-file bilingual builder/inspector UI. The QR code uses `qrcodejs` from a CDN; everything else is local. |
| `web/pay.html` | Payer-facing page: renders a request from the URL fragment, with QR, warnings and wallet deep-link. |
| `web/button.js` | Embeddable "Pay with ZEC" button (`<script type="module" src=".../button.js" data-address="…" data-amount="…" data-memo="…">`). |
| `test/` | 14 `node:test` tests. |

### How it was verified

- **BLAKE2b** matches Node's built-in `blake2b512` for plain hashing, and Python's `hashlib.blake2b` for personalized and truncated output.
- **F4Jumble / UA format** match the official [`zcash-test-vectors`](https://github.com/zcash/zcash-test-vectors) ZIP-316 vectors: encoding the vectors' receivers reproduces the official `u1…` addresses character for character, and decoding recovers the receivers. This is covered in `test/zcash.test.js`.
- **ZIP-321** uses the spec's example addresses and the memo vector `"This is a simple memo."`.

## Run it

Requires Node 18+. No `npm install` needed.

```bash
npm test          # 14 tests
npm start         # web app at http://localhost:8080
```

### CLI

```bash
node bin/zec-request.js inspect <address>      # type, network, and every receiver inside a UA
node bin/zec-request.js build <address> --amount 1.5 --memo "Order #42" --label "Chai Shop"
node bin/zec-request.js parse "zcash:...?amount=1.5&memo=..."
```

### Library

```js
import { buildRequest, parseRequest, inspectAddress, encodeUnified } from './src/zcash.js';

const info = await inspectAddress('u1…');
// { valid, type: 'unified', network, shielded, receivers: [{ type: 'sapling', label, shielded, data }, ...] }

const uri = await buildRequest([{ address: 'u1…', amount: '0.05', memo: 'Order #42' }]);
const payments = await parseRequest(uri);
```

### Deploy the demo (GitHub Pages)

The repo root has an `index.html` that redirects to `web/index.html`, so it works as-is: push to GitHub, then **Settings → Pages → Deploy from branch → `main` / root**. Update the live-demo link above.

## Limitations

- It validates that an address is well-formed and lists its receivers. It cannot prove the receiver keys are *spendable* by the payee (no one can from the address alone).
- Receiver payloads (Orchard / Sapling) are shown as raw hex, not decoded into diversifier and key components.
- ZIP-316 Revision 1 metadata items (typecodes 0xC0 and above, such as expiry) are preserved as "unknown" and not interpreted.
- Sprout addresses are recognised but flagged as deprecated.
- No payment *verification* (checking the chain for receipt).

## Roadmap

1. Payment-received confirmation via a light client and incoming viewing key.
2. Interpret ZIP-316 Revision 1 metadata (expiry height/time).
3. More languages (Tamil, Bengali, Marathi, …).
4. FROST: request payments to a threshold (multi-party) merchant wallet.

## References

- [ZIP-321: Payment Request URIs](https://zips.z.cash/zip-0321)
- [ZIP-316: Unified Addresses](https://zips.z.cash/zip-0316)
- [zcash-test-vectors](https://github.com/zcash/zcash-test-vectors)

## License

MIT, see [LICENSE](LICENSE).
