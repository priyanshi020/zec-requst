// Embeddable "Pay with ZEC" button. Drop on any site:
//   <script type="module" src="https://YOU.github.io/REPO/web/button.js"
//           data-address="u1..." data-amount="0.05" data-memo="Order #42" data-label="My Shop"></script>
// The button links to the zec-request payment page (request stays in the URL fragment, never sent to a server).
import { buildRequest } from '../src/zcash.js';

const s = document.currentScript || [...document.scripts].reverse().find((x) => x.src.includes('button.js'));
const d = s.dataset;

try {
  const uri = await buildRequest([{ address: d.address, amount: d.amount, memo: d.memo, label: d.label, message: d.message }]);
  const a = document.createElement('a');
  a.href = new URL('pay.html', import.meta.url).href + '#' + encodeURIComponent(uri);
  a.target = '_blank'; a.rel = 'noopener';
  a.textContent = d.text || 'Pay with ZEC';
  a.style.cssText = 'display:inline-block;padding:10px 18px;border-radius:8px;background:#f5b942;color:#000;font:600 16px system-ui,sans-serif;text-decoration:none';
  s.after(a);
} catch (e) {
  const span = document.createElement('span');
  span.textContent = 'zec-request: ' + e.message;
  span.style.color = '#b42318';
  s.after(span);
}
