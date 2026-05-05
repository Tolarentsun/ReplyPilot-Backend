/**
 * Tries to find a contact email for each lead by fetching their website.
 * Looks for mailto: links and email patterns in the page HTML.
 * Falls back to guessing info@domain.com if nothing found.
 * Updates the leads CSV in place.
 *
 * Usage: node scripts/enrich-emails.js --csv=leads-all.csv --limit=100
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2).reduce((acc, arg) => {
  const eq = arg.indexOf('=');
  if (eq === -1) return acc;
  acc[arg.slice(2, eq)] = arg.slice(eq + 1);
  return acc;
}, {});

const CSV_PATH = args.csv || 'leads-all.csv';
const LIMIT    = args.limit ? parseInt(args.limit) : Infinity;

function parseCSV(content) {
  const lines = content.trim().split('\n');
  const headers = splitLine(lines[0]);
  return lines.slice(1).map(line => Object.fromEntries(headers.map((h, i) => [h, splitLine(line)[i] ?? ''])));
}

function splitLine(line) {
  const result = []; let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const cell = v => '"' + String(v ?? '').replace(/"/g, "'") + '"';
  return [headers.join(','), ...rows.map(r => headers.map(h => cell(r[h])).join(','))].join('\n');
}

function fetchPage(url, redirects = 0) {
  return new Promise((resolve) => {
    if (redirects > 3) return resolve('');
    try {
      const urlObj = new URL(url);
      const lib = urlObj.protocol === 'https:' ? https : http;
      const req = lib.get({ hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 6000 }, res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          const next = res.headers.location.startsWith('http') ? res.headers.location : `${urlObj.protocol}//${urlObj.hostname}${res.headers.location}`;
          return resolve(fetchPage(next, redirects + 1));
        }
        let body = '';
        res.on('data', c => { if (body.length < 200000) body += c; });
        res.on('end', () => resolve(body));
        res.on('error', () => resolve(''));
      });
      req.on('error', () => resolve(''));
      req.on('timeout', () => { req.destroy(); resolve(''); });
    } catch { resolve(''); }
  });
}

function extractEmail(html) {
  // mailto links first (most reliable)
  const mailto = html.match(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
  if (mailto) return mailto[1].toLowerCase();
  // inline email pattern
  const inline = html.match(/\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b/);
  if (inline && !inline[1].includes('example') && !inline[1].endsWith('.png') && !inline[1].endsWith('.jpg')) {
    return inline[1].toLowerCase();
  }
  return null;
}

function guessDomain(website) {
  try {
    const { hostname } = new URL(website);
    return hostname.replace(/^www\./, '');
  } catch { return null; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const raw = fs.readFileSync(path.resolve(CSV_PATH), 'utf8');
  const leads = parseCSV(raw);
  const toEnrich = leads.filter(l => l.website && !l.email).slice(0, LIMIT);

  console.log(`\n🔍  Enriching ${toEnrich.length} leads with email addresses...\n`);

  let found = 0, guessed = 0, skipped = 0;

  for (let i = 0; i < toEnrich.length; i++) {
    const lead = toEnrich[i];
    process.stdout.write(`  [${String(i + 1).padStart(3)}/${toEnrich.length}] ${lead.business_name.slice(0, 38).padEnd(40)}`);

    const html = await fetchPage(lead.website);
    const idx = leads.findIndex(l => l.business_name === lead.business_name && l.website === lead.website);

    if (html) {
      const email = extractEmail(html);
      if (email) {
        leads[idx].email = email;
        process.stdout.write(`✓ ${email}\n`);
        found++;
      } else {
        const domain = guessDomain(lead.website);
        if (domain) {
          leads[idx].email = `info@${domain}`;
          process.stdout.write(`~ info@${domain}\n`);
          guessed++;
        } else {
          process.stdout.write('no email found\n');
          skipped++;
        }
      }
    } else {
      const domain = guessDomain(lead.website);
      if (domain) {
        leads[idx].email = `info@${domain}`;
        process.stdout.write(`~ info@${domain} (site unreachable)\n`);
        guessed++;
      } else {
        process.stdout.write('skipped\n');
        skipped++;
      }
    }

    await sleep(200);
  }

  fs.writeFileSync(path.resolve(CSV_PATH), toCSV(leads));
  const withEmail = leads.filter(l => l.email).length;
  console.log(`\n✅  Done. Found: ${found} real  Guessed: ${guessed}  Skipped: ${skipped}`);
  console.log(`📧  ${withEmail} leads now have an email address`);
  console.log(`📄  Updated → ${path.resolve(CSV_PATH)}\n`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
