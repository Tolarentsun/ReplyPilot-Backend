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
const FROM      = args.from  || process.env.OUTREACH_FROM || 'ReplyPilot Team <noreply@reply-pilot.net>';
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

// ─── Email wrapper ─────────────────────────────────────────────────────────────
function wrapEmail(bodyHtml, bizName) {
  return `
<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;background:#f5f3ef;padding:24px 16px">

  <div style="background:#0F3460;padding:18px 28px;border-radius:8px 8px 0 0">
    <span style="font-family:Georgia,serif;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">
      Reply<span style="color:#E8922A">Pilot</span>
    </span>
  </div>

  <div style="background:#ffffff;padding:32px 28px;border:1px solid #e8e0d6;border-top:none;border-radius:0 0 8px 8px;color:#1a1a1a;line-height:1.7;font-size:15px">
    ${bodyHtml}
  </div>

  <div style="padding:20px 28px;text-align:center">
    <p style="font-size:11px;color:#999;margin:0">
      © 2026 ReplyPilot &nbsp;·&nbsp;
      <a href="https://reply-pilot.net" style="color:#999;text-decoration:none">reply-pilot.net</a>
      &nbsp;·&nbsp;
      <a href="mailto:RPCS@reply-pilot.net?subject=Unsubscribe&body=Please unsubscribe ${encodeURIComponent(bizName || '')}" style="color:#999;text-decoration:none">Unsubscribe</a>
    </p>
  </div>

</div>`;
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
      html: wrapEmail(`
<p style="margin-top:0">Hi ${firstName},</p>

<p>We came across <strong>${name}</strong> on Google and noticed you have <strong>${unanswered} customer reviews</strong> that haven't received a response yet — including a ${starStr} review:</p>

<blockquote style="border-left:3px solid #E8922A;margin:16px 0;padding:12px 16px;background:#fdf9f4;border-radius:0 6px 6px 0;color:#444;font-style:italic;font-size:14px">
  ${reviewQuote}
</blockquote>

<p>Unanswered reviews cost you customers. <strong>89% of consumers</strong> read owner responses before choosing a local business, and Google's algorithm actively rewards businesses that engage.</p>

<p><strong>ReplyPilot</strong> monitors your Google reviews and generates professional, on-brand responses in seconds — you review it, hit send, done. No more hours spent writing replies.</p>

<p style="text-align:center;margin:28px 0">
  <a href="https://www.reply-pilot.net/register.html"
     style="background:#0F3460;color:#ffffff;padding:13px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block">
    Try ReplyPilot Free — No Card Required →
  </a>
</p>

<p style="color:#555;font-size:14px">Takes about 2 minutes to connect your Google Business Profile. Questions? Just reply to this email.</p>

<p style="margin-bottom:0">
  The ReplyPilot Team<br>
  <a href="https://reply-pilot.net" style="color:#0F3460">reply-pilot.net</a>
</p>`, name)
    };

    case 2: return {
      subject: `Re: ${name}'s Google reviews`,
      html: wrapEmail(`
<p style="margin-top:0">Hi ${firstName},</p>

<p>Following up on our note about <strong>${name}</strong>'s unanswered Google reviews.</p>

<p>Here's a real example of what ReplyPilot generates for a 2-star review — in about 8 seconds:</p>

<div style="background:#f9f7f4;border-radius:8px;padding:18px;margin:16px 0;border:1px solid #e8e0d6">
  <p style="margin:0 0 10px;font-size:14px"><strong style="color:#c0392b">⭐⭐ Customer wrote:</strong><br>
  <em style="color:#555">"Waited 45 minutes for our food. No apology from the staff."</em></p>
  <p style="margin:0;font-size:14px"><strong style="color:#27ae60">✅ ReplyPilot generated:</strong><br>
  <em style="color:#555">"Thank you for sharing your experience. A 45-minute wait is not the standard we hold ourselves to, and we sincerely apologize. We've shared this with our team and would love the chance to make it right — please reach out directly and we'll take care of you on your next visit."</em></p>
</div>

<p>That one response turns a frustrated customer into a potential return visit — and shows everyone else reading your reviews that you care.</p>

<p><strong>Free plan, no contracts, cancel anytime.</strong></p>

<p style="text-align:center;margin:28px 0">
  <a href="https://www.reply-pilot.net/register.html"
     style="background:#0F3460;color:#ffffff;padding:13px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block">
    Start for Free →
  </a>
</p>

<p style="margin-bottom:0">
  The ReplyPilot Team<br>
  <a href="https://reply-pilot.net" style="color:#0F3460">reply-pilot.net</a>
</p>`, name)
    };

    case 3: return {
      subject: `Last note — free access for ${name}`,
      html: wrapEmail(`
<p style="margin-top:0">Hi ${firstName},</p>

<p>This is our last follow-up about <strong>${name}</strong>'s Google reviews.</p>

<p>Right now you have a <strong>${rating}-star average</strong> with <strong>${unanswered} unanswered reviews</strong>. Every week without responses is another week potential customers see that and choose a competitor who does respond.</p>

<p>Here's what ReplyPilot does in plain terms:</p>

<ul style="padding-left:20px;color:#333">
  <li style="margin-bottom:8px">Pulls in your Google reviews automatically every day</li>
  <li style="margin-bottom:8px">Generates a professional, personalized response for each one</li>
  <li style="margin-bottom:8px">You read it, approve it, it posts — under a minute per review</li>
  <li style="margin-bottom:8px">Your response rate goes from 0% to 100%</li>
</ul>

<p style="text-align:center;margin:28px 0">
  <a href="https://www.reply-pilot.net/register.html"
     style="background:#E8922A;color:#ffffff;padding:13px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">
    Claim Your Free Account →
  </a>
</p>

<p style="color:#555;font-size:14px">If review management isn't a priority right now, no worries — we won't follow up again. But if you ever have questions, we're always at <a href="mailto:RPCS@reply-pilot.net" style="color:#0F3460">RPCS@reply-pilot.net</a>.</p>

<p style="margin-bottom:0">
  The ReplyPilot Team<br>
  <a href="https://reply-pilot.net" style="color:#0F3460">reply-pilot.net</a>
</p>`, name)
    };

    case 4: return {
      subject: `Closing the loop on ${name}`,
      html: wrapEmail(`
<p style="margin-top:0">Hi ${firstName},</p>

<p>We've reached out a few times and haven't heard back — so we'll take that as a no for now and won't message you again.</p>

<p>If your situation ever changes — more reviews coming in, a negative review that needs attention, or you want to improve your Google presence — ReplyPilot is at <a href="https://reply-pilot.net" style="color:#0F3460">reply-pilot.net</a> and the free plan is always open.</p>

<p>Wishing <strong>${name}</strong> a busy and successful season ahead.</p>

<p style="margin-bottom:0">
  The ReplyPilot Team<br>
  <a href="https://reply-pilot.net" style="color:#0F3460">reply-pilot.net</a>
</p>`, name)
    };
  }
}

// ─── Resend API ────────────────────────────────────────────────────────────────
function sendEmail({ to, from, subject, html }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ from, to: [to], subject, html, reply_to: 'RPCS@reply-pilot.net' });
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

  // Filter: only send step N to leads that haven't received it yet
  // Blocklist only gates step 1 — for follow-ups, the CSV tracking column is the gate
  const stepKey = `email_step${STEP}_sent`;
  const eligible = leads.filter(l => {
    if (!l.website && !l.phone) return false;
    if (l[stepKey]) return false;
    if (STEP === 1) {
      const email = (TO_OVERRIDE || l.email || '').toLowerCase();
      if (email && blocklist.has(email)) {
        console.log(`  ⛔  ${l.business_name} — already contacted (blocklist), skipping`);
        return false;
      }
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
