const https = require('https');
const http = require('http');
const fs = require('fs');
const { Resend } = require('resend');

const BASE = 'C:/Users/chris/AppData/Local/Temp/ReplyPilot-Backend/';
const SENT_FILE = BASE + 'sent-emails.txt';
const BATCH_OUT = BASE + 'sent-batch5-2026-05-03.txt';

const sentSet = new Set(fs.readFileSync(SENT_FILE, 'utf8').toLowerCase().split('\n').map(e => e.trim()).filter(Boolean));
const batchSent = [];

const RESEND_KEY = process.env.RESEND_API_KEY;
const resend = new Resend(RESEND_KEY);

const JUNK = new Set(['user@domain.com','email@address.com','info@twitter.com','test@test.com',
  'example@example.com','info@rebrand.ly','noreply@','no-reply@','support@squarespace.com',
  'privacy@','legal@','hello@squarespace','info@wix.com']);

const CATEGORIES = ['restaurants','hotels','spas','salons','auto-repair','dentists','gyms','cafes'];
const CITIES = [
  'Seattle, WA','Portland, OR','Denver, CO','Phoenix, AZ','San Diego, CA',
  'Minneapolis, MN','Atlanta, GA','Boston, MA','Miami, FL','Charlotte, NC',
  'Tampa, FL','Nashville, TN','Indianapolis, IN','Columbus, OH','Louisville, KY',
  'Sacramento, CA','Las Vegas, NV','Salt Lake City, UT','Albuquerque, NM','Tucson, AZ',
  'Raleigh, NC','Richmond, VA','Pittsburgh, PA','Cincinnati, OH','Kansas City, MO'
];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(opts.headers || {})
      },
      timeout: 12000
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location;
        const nextUrl = loc.startsWith('http') ? loc : new URL(loc, url).href;
        return fetch(nextUrl, opts).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function extractEmails(html, domain) {
  const emails = new Set();
  // mailto links
  const maltoRx = /mailto:([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})/gi;
  let m;
  while ((m = maltoRx.exec(html)) !== null) emails.add(m[1].toLowerCase());
  // plain text emails
  const plainRx = /\b([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})\b/gi;
  while ((m = plainRx.exec(html)) !== null) emails.add(m[1].toLowerCase());

  const filtered = [...emails].filter(e => {
    if (JUNK.has(e)) return false;
    if ([...JUNK].some(j => e.includes(j.replace('@','')))) return false;
    if (e.includes('noreply') || e.includes('no-reply') || e.includes('donotreply')) return false;
    if (e.endsWith('.png') || e.endsWith('.jpg') || e.endsWith('.gif')) return false;
    return true;
  });

  if (!domain) return filtered[0] || null;
  const domainEmails = filtered.filter(e => e.split('@')[1] === domain);
  return domainEmails[0] || filtered[0] || null;
}

async function scrapeWebsiteForEmail(siteUrl) {
  try {
    const origin = new URL(siteUrl).origin;
    const domain = new URL(siteUrl).hostname.replace('www.','');

    // Try homepage first
    const home = await fetch(origin + '/');
    if (home.status === 200) {
      const email = extractEmails(home.body, domain);
      if (email) return email;
    }
    await delay(500);

    // Try /contact
    const contact = await fetch(origin + '/contact');
    if (contact.status === 200) {
      const email = extractEmails(contact.body, domain);
      if (email) return email;
    }
    return null;
  } catch {
    return null;
  }
}

async function scrapeYellowPages(category, city) {
  const results = [];
  try {
    const encodedCity = encodeURIComponent(city);
    const url = `https://www.yellowpages.com/search?search_terms=${category}&geo_location_terms=${encodedCity}`;
    console.log(`  YP: ${category} in ${city}`);

    const res = await fetch(url);
    if (res.status !== 200) { console.log(`    -> Status ${res.status}`); return []; }

    const html = res.body;

    // Extract business listings - look for website links in results
    // YP pattern: <a class="track-visit-website" href="...">
    const websiteRx = /<a[^>]+class="[^"]*track-visit-website[^"]*"[^>]+href="([^"]+)"/g;
    const nameRx = /<a[^>]+class="[^"]*business-name[^"]*"[^>]*>([^<]+)<\/a>/g;

    const websites = [];
    let wm;
    while ((wm = websiteRx.exec(html)) !== null) {
      const href = wm[1];
      if (href.startsWith('http') && !href.includes('yellowpages.com')) {
        websites.push(href);
      }
    }

    const names = [];
    let nm;
    while ((nm = nameRx.exec(html)) !== null) {
      names.push(nm[1].trim());
    }

    // Also try data-ya-track links
    const trackRx = /<a[^>]+data-ya-track="website"[^>]+href="([^"]+)"/g;
    let tm;
    while ((tm = trackRx.exec(html)) !== null) {
      const href = tm[1];
      if (href.startsWith('http') && !href.includes('yellowpages.com') && !websites.includes(href)) {
        websites.push(href);
      }
    }

    console.log(`    -> Found ${websites.length} websites, ${names.length} names`);
    for (let i = 0; i < Math.min(websites.length, 20); i++) {
      results.push({ name: names[i] || `Business in ${city}`, website: websites[i], city });
    }
  } catch (e) {
    console.log(`    -> Error: ${e.message}`);
  }
  return results;
}

function buildEmail(bizName, city) {
  const firstName = 'Chris';
  return {
    from: 'Chris from ReplyPilot <noreply@reply-pilot.net>',
    reply_to: 'Christophersw1011@gmail.com',
    subject: `Manage your ${city.split(',')[0]} reviews with AI — ReplyPilot`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;color:#222;line-height:1.6">
<p>Hi ${bizName} team,</p>
<p>I'm Chris, founder of <strong>ReplyPilot</strong> — an AI tool built specifically for local businesses like yours to manage online reviews smarter.</p>
<p>Here's what it does:</p>
<ul>
<li>📊 <strong>Auto-analyzes</strong> every Google, Yelp & Facebook review with sentiment scoring</li>
<li>✍️ <strong>Generates professional responses</strong> in one click — sounds like you, not a bot</li>
<li>🔔 <strong>Alerts you</strong> when a new review comes in so nothing slips through</li>
<li>📈 <strong>Tracks your rating trends</strong> over time so you can see what's working</li>
</ul>
<p>Businesses using ReplyPilot typically see a <strong>30–40% improvement in response rates</strong> and spend way less time managing reviews manually.</p>
<p>You can start <strong>completely free</strong> — no credit card needed:<br>
👉 <a href="https://reply-pilot.net/register.html">https://reply-pilot.net/register.html</a></p>
<p>Would love to hear what review platform is your biggest headache right now.</p>
<p>Best,<br>${firstName}<br>Founder, ReplyPilot<br><a href="https://reply-pilot.net">reply-pilot.net</a></p>
<p style="font-size:11px;color:#999;margin-top:24px">You're receiving this because your business is listed online. Reply with "unsubscribe" to opt out.</p>
</div>`
  };
}

async function main() {
  console.log('Starting YellowPages lead gen + email send...');
  console.log('Resend key:', RESEND_KEY ? RESEND_KEY.slice(0,12) + '...' : 'MISSING');

  let totalSent = 0;
  let totalFound = 0;
  const TARGET = 300;

  for (const city of CITIES) {
    if (totalSent >= TARGET) break;

    for (const cat of CATEGORIES) {
      if (totalSent >= TARGET) break;

      const listings = await scrapeYellowPages(cat, city);
      await delay(2000); // be nice to YP

      for (const biz of listings) {
        if (totalSent >= TARGET) break;
        if (!biz.website) continue;

        let email = null;
        try {
          email = await scrapeWebsiteForEmail(biz.website);
          await delay(600);
        } catch {}

        if (!email) continue;
        if (sentSet.has(email)) { console.log(`  SKIP (already sent): ${email}`); continue; }
        if (email.split('@')[1] === 'reply-pilot.net') continue;

        totalFound++;
        sentSet.add(email);

        try {
          const msg = buildEmail(biz.name, city);
          msg.to = email;
          await resend.emails.send(msg);

          batchSent.push(email);
          totalSent++;
          console.log(`  [${totalSent}] SENT to ${email} (${biz.name}, ${city})`);

          fs.appendFileSync(SENT_FILE, email + '\n');

          await delay(400);
        } catch (e) {
          console.log(`  SEND FAIL ${email}: ${e.message}`);
        }
      }
    }
  }

  if (batchSent.length > 0) {
    fs.writeFileSync(BATCH_OUT, batchSent.join('\n'));
    console.log(`\nBatch saved to ${BATCH_OUT}`);
  }

  console.log(`\nDone! Sent: ${totalSent} | Emails found: ${totalFound}`);
}

main().catch(console.error);
