#!/usr/bin/env node
import { buildRequest, parseRequest, inspectAddress } from '../src/zcash.js';

const [cmd, ...rest] = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) flags[rest[i].slice(2)] = rest[++i];
  else pos.push(rest[i]);
}

const usage = `zec-request - Zcash ZIP-321 toolkit

  zec-request inspect <address>
  zec-request build <address> [--amount 1.5] [--memo "text"] [--label L] [--message M]
  zec-request parse "<zcash: uri>"`;

try {
  if (cmd === 'inspect' && pos[0]) {
    console.log(JSON.stringify(await inspectAddress(pos[0]), null, 2));
  } else if (cmd === 'build' && pos[0]) {
    console.log(await buildRequest([{ address: pos[0], ...flags }]));
  } else if (cmd === 'parse' && pos[0]) {
    console.log(JSON.stringify(await parseRequest(pos[0]), null, 2));
  } else {
    console.log(usage);
    process.exit(cmd ? 1 : 0);
  }
} catch (e) {
  console.error('error:', e.message);
  process.exit(1);
}
