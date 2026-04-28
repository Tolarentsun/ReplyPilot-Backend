/**
 * ReplyPilot Cold Email Sender
 * Reads leads CSV (from find-leads.js) and sends a personalized cold email
 * sequence via Resend. Tracks which emails have been sent back to the CSV.
 *
 * Usage:
 *   node scripts/send-emails.js --csv=leads.csv --step=1 --from=chris@reply-pilot.net
 *   node scripts/send-emails.js --csv=leads.csv --step=2 --from=chris@reply-pilot.net --dry-run
 *
 * Steps:
 *   1 = Day 1:  The hook (unanswered review problem)
 *   2 = Day 3:  Social proof follow-up
 *   3 = Day 7:  Free trial offer
 *   4 = Day 14: Break-up email
 *
 * Flags:
 *   --dry-run    Print emails to console without sending
 *   --limit=N    Only send to first N leads (for testing)
 *   --to=email   Override recipient (send all to one address for testing)
 *
 * Requirements:
 *   RESEND_API_KEY env var set (same key already in Railway)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ─── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2).reduce((acc, arg) => {
  if (arg.startsWith('--')) {
    const eq = arg.indexOf('=');
    if (eq === -1) acc[arg.slice(2)] = true;
    else acc[arg.slice(2, eq)] = arg.slice(eq + 1);
  }
  return acc;
}, {});

const CSV_PATH  = args.csv   || 'leads.csv';
const STEP      = parseInt(args.step || '1');
const FROM      = args.from  || process.env.OUTREACH_FROM || 'chris@reply-pilot.net';
const DRY_RUN   = !!args['dry-run'];
const LIMIT     = args.limit ? parseInt(args.limit) : Infinity;
const TO_OVERRIDE = args.to || null;
const API_KEY   = process.env.RESEND_API_KEY;

// Master blocklist — any email that has ever been sent to (across all campaigns)
const BLOCKLIST_PATH = path.resolve(args.blocklist || path.join(__dirname, '..', 'sent-emails.txt'));
function loadBlocklist() {
  if (!fs.existsSync(BLOCKLIST_PATH)) return new Set();
  return new Set(fs.readFileSync(BLOCKLIST_PATH, 'utf8').split('\n').map(e => e.trim().toLowerCase()).filter(Boolean));
}
function appendToBlocklist(emails) {
  fs.appendFileSync(BLOCKLIST_PATH, emails.map(e => e.toLowerCase()).join('\n') + '\n');
}

if (!API_KEY && !DRY_RUN) {
  console.error('\n❌  RESEND_API_KEY not set. Use --dry-run to preview emails.\n');
  process.exit(1);
}
if (STEP < 1 || STEP > 4) {
  console.error('\n❌  --step must be 1–4\n');
  process.exit(1);
}

// ─── CSV parser (no dependencies) ─────────────────────────────────────────────
function parseCSV(content) {
  const lines = content.trim().split('\n');
  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = splitCSVLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
  });
}

function splitCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { result.push(cur.trim()); cur = ''; continue; }
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

// ─── Email templates ───────────────────────────────────────────────────────────
function getEmail(step, lead) {
  const name        = lead.business_name;
  const firstName   = 'there'; // could enhance with owner name lookup
  const unanswered  = lead.unanswered_count || 'several';
  const rating      = lead.rating;
  const sampleText  = lead.sample_review_snippet;
  const sampleStars = lead.sample_review_stars;
  const mapsUrl     = lead.google_maps_url;

  const starStr = sampleStars ? `${sampleStars}-star` : 'recent';
  const reviewQuote = sampleText
    ? `"${sampleText.slice(0, 80)}${sampleText.length > 80 ? '...' : ''}"`
    : 'a recent customer review';

  switch (step) {
    case 1: return {
      subject: `${name} has ${unanswered} unanswered Google reviews`,
      html: `
<p>Hi ${firstName},</p>

<p>I came across ${name} on Google and noticed you have ${unanswered} customer reviews that haven't received a response yet — including a ${starStr} review that says:</p>

<blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#555;font-style:italic;">
  ${reviewQuote}
</blockquote>

<p>Unanswered reviews — especially negative ones — are costing you customers. Studies show <strong>89% of consumers</strong> read owner responses before choosing a local business, and Google's algorithm actively rewards accounts that engage.</p>

<p>I built <strong>ReplyPilot</strong> specifically for restaurants and local businesses. It monitors your Google reviews and generates professional, on-brand responses in seconds. You review it, hit send, done.</p>

<p>We have a free plan — no credit card needed. Takes about 2 minutes to connect your Google Business Profile.</p>

<p><a href="https://www.reply-pilot.net/register.html" style="background:#0A0A0F;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">Try ReplyPilot Free →</a></p>

<p>Happy to answer any questions — just reply here.</p>

<p>Chris<br>
ReplyPilot<br>
<a href="https://www.reply-pilot.net">reply-pilot.net</a></p>

<p style="font-size:11px;color:#999;">
  You're receiving this because ${name} has public reviews on Google Maps.
  <a href="mailto:RPCS@reply-pilot.net?subject=Unsubscribe">Unsubscribe</a>
</p>`
    };

    case 2: return {
      subject: `Re: ${name}'s Google reviews`,
      html: `
<p>Hi ${firstName},</p>

<p>Just following up on my note from a few days ago about your unanswered Google reviews.</p>

<p>Wanted to share a quick example of what ReplyPilot generates for a 2-star review:</p>

<div style="background:#f5f5f5;border-radius:8px;padding:16px;margin:16px 0">
  <p style="margin:0 0 8px"><strong>Customer wrote:</strong> <em>"Waited 45 minutes for our food. No apology from the staff."</em></p>
  <p style="margin:0"><strong>ReplyPilot generated:</strong> <em>"Thank you for sharing your experience. A 45-minute wait is not the standard we hold ourselves to, and I sincerely apologize. We've shared this feedback with our team. We'd love the chance to make it right — please reach out directly and we'll take care of you on your next visit."</em></p>
</div>

<p>That response took about 8 seconds to generate and approve. It turns a frustrated customer into a potential return visit, and shows everyone else reading your reviews that you care.</p>

<p>ReplyPilot starts free. No contracts, cancel anytime.</p>

<p><a href="https://www.reply-pilot.net/register.html" style="background:#0A0A0F;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">Start for Free →</a></p>

<p>Chris<br>
ReplyPilot</p>

<p style="font-size:11px;color:#999;">
  <a href="mailto:RPCS@reply-pilot.net?subject=Unsubscribe&body=Please remove ${encodeURIComponent(name)}">Unsubscribe</a>
</p>`
    };

    case 3: return {
      subject: `Free access for ${name} — this week only`,
      html: `
<p>Hi ${firstName},</p>

<p>Third and final note about your Google reviews.</p>

<p>Right now ${name} has a ${rating}-star average with ${unanswered} unanswered reviews. Every week that goes by without responses is another week potential customers see that and choose a competitor.</p>

<p>Here's what ReplyPilot does in plain terms:</p>

<ul>
  <li>Pulls in your Google reviews automatically every day</li>
  <li>Generates a professional, personalized response for each one</li>
  <li>You read it, approve it, it posts — takes under a minute per review</li>
  <li>Your response rate goes from 0% to 100%</li>
</ul>

<p>The free plan covers everything you need to get started — no card required.</p>

<p><a href="https://www.reply-pilot.net/register.html" style="background:#E8922A;color:#0A0A0F;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:700;display:inline-block">Claim Your Free Account →</a></p>

<p>If review management isn't a priority right now, no worries — I won't follow up again. But if you have any questions at all, just reply and I'll help.</p>

<p>Chris<br>
ReplyPilot</p>

<p style="font-size:11px;color:#999;">
  <a href="mailto:RPCS@reply-pilot.net?subject=Unsubscribe">Unsubscribe</a>
</p>`
    };

    case 4: return {
      subject: `Closing the loop on ${name}`,
      html: `
<p>Hi ${firstName},</p>

<p>I've reached out a few times about ReplyPilot and haven't heard back — so I'll take that as a no for now and stop messaging you.</p>

<p>If your situation ever changes — more reviews coming in, a negative review that needs attention, or you just want to improve your Google ranking — ReplyPilot is at <a href="https://www.reply-pilot.net">reply-pilot.net</a> and the free plan is always open.</p>

<p>Wishing ${name} a busy season.</p>

<p>Chris<br>
ReplyPilot</p>

<p style="font-size:11px;color:#999;">
  <a href="mailto:RPCS@reply-pilot.net?subject=Unsubscribe">Unsubscribe</a>
</p>`
    };
  }
}

// ─── Resend API ────────────────────────────────────────────────────────────────
function sendEmail({ to, from, subject, html }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ from, to: [to], subject, html });
    const req = https.request({
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
          else reject(new Error(parsed.message || `HTTP ${res.statusCode}`));
        } catch {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const csvPath = path.resolve(CSV_PATH);
  if (!fs.existsSync(csvPath)) {
    console.error(`\n❌  CSV file not found: ${csvPath}\n`);
    process.exit(1);
  }

  const raw = fs.readFileSync(csvPath, 'utf8');
  let leads = parseCSV(raw);

  const blocklist = loadBlocklist();
  console.log(`🚫  Blocklist loaded: ${blocklist.size} emails already contacted across all campaigns`);

  // Filter: only send step N to leads that haven't received it yet AND aren't on the global blocklist
  const stepKey = `email_step${STEP}_sent`;
  const eligible = leads.filter(l => {
    if (!l.website && !l.phone) return false;
    if (l[stepKey]) return false;
    const email = (TO_OVERRIDE || l.email || '').toLowerCase();
    if (email && blocklist.has(email)) {
      console.log(`  ⛔  ${l.business_name} — already contacted (blocklist), skipping`);
      return false;
    }
    return true;
  }).slice(0, LIMIT);

  if (!eligible.length) {
    console.log(`\n⚠️  No eligible leads for step ${STEP}. All already contacted, or CSV has no new leads.\n`);
    return;
  }

  const mode = DRY_RUN ? 'DRY RUN' : 'LIVE';
  console.log(`\n📧  Step ${STEP} email — ${mode} — ${eligible.length} recipients\n`);
  if (DRY_RUN) console.log('─── PREVIEW (not sending) ───────────────────────────────\n');

  let sent = 0;
  let failed = 0;

  for (const lead of eligible) {
    // We need an email address. The Google Places API doesn't return email —
    // but we can guess common patterns from the website domain, or the CSV may
    // have been manually enriched. Skip leads with no email.
    const to = TO_OVERRIDE || lead.email || '';

    const email = getEmail(STEP, lead);

    if (DRY_RUN) {
      console.log(`To:      ${to || '(no email — would skip)'}`);
      console.log(`Subject: ${email.subject}`);
      console.log(`Lead:    ${lead.business_name} | ${lead.unanswered_count} unanswered | ${lead.rating}★`);
      console.log();
      continue;
    }

    if (!to) {
      console.log(`  ⚠  ${lead.business_name} — no email address, skipping`);
      continue;
    }

    try {
      await sendEmail({ to, from: FROM, subject: email.subject, html: email.html });

      // Mark as sent in the leads array
      const idx = leads.indexOf(lead);
      if (!leads[idx][stepKey]) leads[idx][stepKey] = new Date().toISOString().split('T')[0];

      // Add to global blocklist so future campaigns never re-contact this email
      if (STEP === 1) appendToBlocklist([to]);

      console.log(`  ✓  ${lead.business_name} → ${to}`);
      sent++;
      await sleep(300); // gentle rate limiting
    } catch (e) {
      console.log(`  ✗  ${lead.business_name} → ${to}: ${e.message}`);
      failed++;
    }
  }

  // Write updated CSV back (preserves sent dates)
  if (!DRY_RUN) {
    fs.writeFileSync(csvPath, toCSV(leads));
    console.log(`\n✅  Sent: ${sent}  Failed: ${failed}`);
    console.log(`📄  CSV updated with sent dates → ${csvPath}\n`);

    const nextStep = STEP + 1;
    if (nextStep <= 4) {
      const days = [null, 3, 4, 7][STEP]; // days until next step
      console.log(`Next: Run step ${nextStep} in ~${days} days:`);
      console.log(`  node scripts/send-emails.js --csv="${CSV_PATH}" --step=${nextStep} --from=${FROM}\n`);
    }
  }
}

main().catch(err => {
  console.error('\n❌  Fatal:', err.message);
  process.exit(1);
});
