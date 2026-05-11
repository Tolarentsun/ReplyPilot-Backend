/**
 * Follow-up script: sends a second touch to the 90 businesses from ReplyPilot-Outreach-Tracking.csv
 * Originally contacted 2026-04-28 (12 days ago), no replies recorded
 */
const fs = require('fs');
const { Resend } = require('resend');

const TRACKING_CSV = 'C:/Users/chris/Downloads/ReplyPilot-Outreach-Tracking.csv';
const FOLLOWUP_LOG = 'C:/Users/chris/AppData/Local/Temp/ReplyPilot-Backend/sent-followup1-2026-05-10.txt';

const RESEND_KEY = process.env.RESEND_API_KEY;
const resend = new Resend(RESEND_KEY);

function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  return lines.slice(1).map(line => {
    const vals = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    vals.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = vals[i] || '');
    return obj;
  });
}

function wrapEmail(body) {
  return `<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;background:#f5f3ef;padding:24px 16px"><div style="background:#0F3460;padding:18px 28px;border-radius:8px 8px 0 0"><span style="font-family:Georgia,serif;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">Reply<span style="color:#E8922A">Pilot</span></span></div><div style="background:#ffffff;padding:32px 28px;border:1px solid #e8e0d6;border-top:none;border-radius:0 0 8px 8px;color:#1a1a1a;line-height:1.7;font-size:15px">${body}</div><div style="padding:20px 28px;text-align:center"><p style="font-size:11px;color:#999;margin:0">2026 ReplyPilot &nbsp; <a href="https://reply-pilot.net" style="color:#999;text-decoration:none">reply-pilot.net</a> &nbsp; <a href="mailto:RPCS@reply-pilot.net?subject=Unsubscribe" style="color:#999;text-decoration:none">Unsubscribe</a></p></div></div>`;
}

function buildFollowUp(bizName) {
  const greeting = bizName ? `Hi ${bizName} team,` : 'Hi there,';
  const body = `<p style="margin-top:0">${greeting}</p>
<p>I reached out about a week ago about ReplyPilot -- wanted to follow up in case my last email got buried.</p>
<p>Quick recap: ReplyPilot uses AI to write professional responses to your Google reviews in seconds. Instead of spending 20 minutes crafting a reply (or skipping it entirely), you paste the review, click generate, and get a ready-to-post response in under 20 seconds.</p>
<p>Most business owners tell us two things after signing up:</p>
<ol>
  <li style="margin-bottom:8px"><strong>They had no idea how many reviews were going unanswered</strong> — ReplyPilot makes it easy to catch up on months of backlog fast.</li>
  <li style="margin-bottom:8px"><strong>The analytics surprised them</strong> — seeing exactly which complaints repeat across reviews is genuinely useful for running a better business.</li>
</ol>
<p>Free plan, no credit card, takes 2 minutes to set up. Worth a look:</p>
<p style="text-align:center;margin:28px 0"><a href="https://reply-pilot.net/register.html" style="background:#0F3460;color:#ffffff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">Try ReplyPilot Free</a></p>
<p style="margin-bottom:0">The ReplyPilot Team<br><a href="https://reply-pilot.net" style="color:#0F3460">reply-pilot.net</a></p>`;
  return { from: 'ReplyPilot Team <noreply@reply-pilot.net>', reply_to: 'RPCS@reply-pilot.net', subject: 'Following up — free AI review responder for your business', html: wrapEmail(body) };
}

async function main() {
  console.log('Follow-up script — ReplyPilot-Outreach-Tracking.csv contacts');
  console.log('Resend key:', RESEND_KEY ? RESEND_KEY.slice(0,12) + '...' : 'MISSING\n');

  const csv = fs.readFileSync(TRACKING_CSV, 'utf8');
  const rows = parseCSV(csv);
  const targets = rows.filter(r => r.email && r.email.trim() && r.email_step1_sent && r.email_step1_sent.trim() && !r.replied.trim());

  console.log(`Found ${targets.length} contacts to follow up\n`);

  const sent = [];
  let count = 0;

  for (const row of targets) {
    const email = row.email.trim();
    if (!email || email.includes('yourdomain') || email.includes('example.com')) continue;

    try {
      const msg = buildFollowUp(row.business_name);
      msg.to = email;
      await resend.emails.send(msg);
      count++;
      sent.push(email);
      console.log(`[${count}] ${email} (${row.business_name})`);
      await new Promise(r => setTimeout(r, 300));
    } catch(e) {
      console.log(`FAIL: ${email} — ${e.message?.slice(0,60)}`);
    }
  }

  fs.writeFileSync(FOLLOWUP_LOG, sent.join('\n') + '\n');
  console.log(`\nDone. Sent ${count} follow-up emails -> ${FOLLOWUP_LOG}`);
}

main().catch(console.error);
