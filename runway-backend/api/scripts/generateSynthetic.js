/**
 * Generates a realistic, deterministic HDFC-style statement (CSV) for demos and tests.
 * Contains rent, allowance, subscriptions, lumpy variable spending, one big outlier
 * purchase, a self-transfer pair and a refund, so every parsing rule gets exercised.
 *
 *   node scripts/generateSynthetic.js --out ../db/demo_statement.csv --end 2026-09-19
 */
const fs = require('fs');

const DEMO = {
  startingBalancePaise: 3_600_000, // Rs 36,000
  allowancePaise: 1_300_000, // Rs 13,000 on the 1st
  allowanceDay: 1,
  rentPaise: 550_000, // Rs 5,500 on the 5th
  rentDay: 5,
};

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fmtMoney = (paise) => {
  const s = (paise / 100).toFixed(2);
  const [i, d] = s.split('.');
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${d}`;
};
const ddmmyy = (d) =>
  `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCFullYear()).slice(2)}`;
const csvField = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function generate({ endDate, days = 120, seed = 7 }) {
  const rand = mulberry32(seed);
  const rupees = (lo, hi) => Math.round(lo + rand() * (hi - lo)) * 100;
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const ref = () => String(Math.floor(rand() * 9e11) + 1e11);
  const upi = (name, vpa) => `UPI-${name}-${vpa}-YESB0YBLUPI-${ref()}-UPI`;

  const end = new Date(`${endDate}T00:00:00Z`);
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  let balance = DEMO.startingBalancePaise;
  const out = [];

  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const dom = d.getUTCDate();
    const dow = d.getUTCDay();
    const push = (narration, debit = 0, credit = 0) => {
      balance += credit - debit;
      out.push({ d, narration, debit, credit, balance });
    };

    if (dom === DEMO.allowanceDay) push(`NEFT CR-SBIN0004567-RAMESH GUPTA-POCKET MONEY`, 0, DEMO.allowancePaise);
    if (dom === DEMO.rentDay) push(upi('LANDLORD SHARMA', '9876543210@ybl') + '-RENT', DEMO.rentPaise);
    if (dom === 12) push('POS 437546XXXXXX1234 SPOTIFY INDIA MUMBAI', 11_900);
    if (dom === 20) push('POS 437546XXXXXX1234 NETFLIX.COM MUMBAI', 19_900);

    if (rand() < 0.4) push(upi(pick(['SWIGGY', 'ZOMATO', 'DOMINOS PIZZA']), 'merchant@ybl'), rupees(120, 350));
    if (rand() < 0.25) push(upi(pick(['UBER INDIA', 'RAPIDO', 'OLA CABS']), 'merchant@paytm'), rupees(60, 220));
    if (rand() < 0.12) push(upi(pick(['BLINKIT', 'ZEPTO']), 'merchant@okaxis'), rupees(200, 600));
    if (rand() < 0.55) push(upi(pick(['CHAI POINT', 'CAMPUS CANTEEN', 'JUICE CORNER']), 'shop@okicici'), rupees(20, 110));
    if (dow === 6 && rand() < 0.35) push(upi('SOCIAL CAFE', 'social@ybl'), rupees(500, 1300));
    if (rand() < 0.03) push('POS 437546XXXXXX1234 MYNTRA DESIGNS BANGALORE', rupees(800, 2200));
    if (rand() < 0.02) push('ATM WDL-ATM S1 GLA UNIVERSITY MATHURA', rupees(500, 1500));

    if (i === Math.floor(days * 0.5)) push('POS 437546XXXXXX1234 FLIPKART INTERNET BANGALORE', 1_899_900); // phone: outlier
    if (i === 40) push(upi('MADHAV GUPTA', 'madhav@okhdfcbank') + '-SELF', 300_000); // self-transfer out...
    if (i === 41) push(upi('MADHAV GUPTA', 'madhav@okhdfcbank') + '-SELF', 0, 300_000); // ...and back
    if (i === 70) push('REFUND AMAZON PAY INDIA', 0, 45_000);
  }

  const header = 'Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance';
  const lines = out.map((r) =>
    [
      ddmmyy(r.d),
      csvField(r.narration),
      ref(),
      ddmmyy(r.d),
      r.debit ? csvField(fmtMoney(r.debit)) : '',
      r.credit ? csvField(fmtMoney(r.credit)) : '',
      csvField(fmtMoney(r.balance)),
    ].join(','),
  );
  const last = out[out.length - 1];
  return {
    csv: [header, ...lines].join('\n') + '\n',
    meta: {
      rows: out.length,
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
      closingBalancePaise: last.balance,
    },
  };
}

if (require.main === module) {
  const arg = (name, dflt) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > -1 ? process.argv[i + 1] : dflt;
  };
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const { csv, meta } = generate({ endDate: arg('end', yesterday), days: Number(arg('days', 120)), seed: Number(arg('seed', 7)) });
  fs.writeFileSync(arg('out', 'demo_statement.csv'), csv);
  console.log(`Wrote ${meta.rows} rows (${meta.from} -> ${meta.to}), closing balance Rs ${fmtMoney(meta.closingBalancePaise)}`);
}

module.exports = { generate, DEMO };
