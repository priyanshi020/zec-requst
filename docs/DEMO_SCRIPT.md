# Demo video script (~90 seconds)

Record the screen at http://localhost:8080 (`npm start`) with a terminal beside it.

1. **0:00 Hook.** "Sharing a Zcash payment usually means pasting an address and hoping the payer gets the amount and memo right. zec-request fixes that with ZIP-321 links."
2. **0:10 Build.** Paste a Sapling/Unified address. Show the live ✓ shielded badge. Enter amount `0.05`, label `Chai Shop`, memo `Order #42`. Click **Generate link**. Show the URI and QR.
3. **0:35 Guard rails.** Paste a transparent `t1…` address with a memo. Click Generate: show the error "memos cannot be sent to transparent addresses". Corrupt one character of an address: show the checksum error.
4. **0:50 Inspect (the wow moment).** Click **Try an example**: a `u1…` address is decoded live into its receivers (Transparent P2PKH marked PUBLIC, Sapling shielded). Say: "A Unified address is scrambled with F4Jumble, so you can't read it by eye. This decodes it locally so you know exactly what you're paying." Flip the language toggle to हिन्दी.
5. **1:05 Payer view.** Back in the builder click **Open shareable payment page**: show what the *payer* sees (amount, memo, QR, "Open in wallet", privacy warnings). Then open `web/embed-example.html` and click the **Pay with ZEC** button to show the one-line embed.
6. **1:15 CLI + tests.** In the terminal: `node bin/zec-request.js build <addr> --amount 1.5 --memo hi`, then `npm test` (14 passing, incl. official ZIP-316 vectors).
7. **1:25 Close.** "Zero dependencies, runs locally, MIT licensed. Next: payment confirmation via viewing keys, and FROST-based merchant wallets."
