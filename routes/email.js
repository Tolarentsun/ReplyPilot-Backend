const axios = require('axios');

const BASE_URL = process.env.FRONTEND_URL || 'https://reply-pilot.net';
const FROM = process.env.EMAIL_FROM || 'ReplyPilot <noreply@reply-pilot.net>';

async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[Email] No RESEND_API_KEY — skipping: ${subject} to ${to}`);
    return { success: false };
  }
  try {
    const res = await axios.post('https://api.resend.com/emails',
      { from: FROM, to: [to], subject, html },
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
    );
    return { success: true, id: res.data.id };
  } catch (e) {
    console.error('[Email] Send failed:', e.response?.data || e.message);
    return { success: false };
  }
}

function welcomeEmail(name) {
  return `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#FAF8F4;padding:40px 32px;border-radius:12px">
    <div style="font-family:Georgia,serif;font-size:26px;font-weight:800;color:#0A0A0F;margin-bottom:24px">Reply<span style="color:#E8922A">Pilot</span></div>
    <h1 style="font-family:Georgia,serif;font-size:28px;font-weight:800;color:#0A0A0F;margin-bottom:12px">Welcome, ${name}.</h1>
    <p style="font-size:15px;color:#6B6878;line-height:1.7;margin-bottom:24px">Your ReplyPilot account is ready. Start by adding your first review — the AI will analyze it, score the sentiment, and generate a professional response in seconds.</p>
    <a href="${BASE_URL}/dashboard.html" style="display:inline-block;background:#0A0A0F;color:white;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;margin-bottom:32px">Go to Dashboard →</a>
    <hr style="border:none;border-top:1px solid #E8E4DC;margin-bottom:24px">
    <p style="font-size:13px;color:#6B6878;line-height:1.6">You're on the free Starter plan — up to 25 reviews and 5 AI responses per month. Upgrade anytime from your dashboard. Questions? Reply to this email.</p>
    <p style="font-size:12px;color:#9CA3AF;margin-top:24px">© 2025 ReplyPilot · <a href="${BASE_URL}/privacy.html" style="color:#9CA3AF">Privacy</a> · <a href="${BASE_URL}/terms.html" style="color:#9CA3AF">Terms</a></p>
  </div>`;
}

function passwordResetEmail(name, token) {
  const link = `${BASE_URL}/reset-password.html?token=${token}`;
  return `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#FAF8F4;padding:40px 32px;border-radius:12px">
    <div style="font-family:Georgia,serif;font-size:26px;font-weight:800;color:#0A0A0F;margin-bottom:24px">Reply<span style="color:#E8922A">Pilot</span></div>
    <h1 style="font-family:Georgia,serif;font-size:26px;font-weight:800;color:#0A0A0F;margin-bottom:12px">Reset your password</h1>
    <p style="font-size:15px;color:#6B6878;line-height:1.7;margin-bottom:8px">Hi ${name}, we received a request to reset your ReplyPilot password. Click the button below — this link expires in 1 hour.</p>
    <a href="${link}" style="display:inline-block;background:#0A0A0F;color:white;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;margin:24px 0 32px">Reset Password →</a>
    <p style="font-size:13px;color:#6B6878">If you didn't request this, you can safely ignore this email. Your password won't change.</p>
    <p style="font-size:12px;color:#9CA3AF;margin-top:24px">© 2025 ReplyPilot · <a href="${BASE_URL}/privacy.html" style="color:#9CA3AF">Privacy</a></p>
  </div>`;
}

function subscriptionEmail(name, plan) {
  const planLabel = plan === 'business' ? 'Business' : 'Professional';
  return `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#FAF8F4;padding:40px 32px;border-radius:12px">
    <div style="font-family:Georgia,serif;font-size:26px;font-weight:800;color:#0A0A0F;margin-bottom:24px">Reply<span style="color:#E8922A">Pilot</span></div>
    <h1 style="font-family:Georgia,serif;font-size:26px;font-weight:800;color:#0A0A0F;margin-bottom:12px">You're on ${planLabel}. 🎉</h1>
    <p style="font-size:15px;color:#6B6878;line-height:1.7;margin-bottom:24px">Hi ${name}, your subscription is confirmed. All ${planLabel} features are now unlocked in your dashboard.</p>
    <a href="${BASE_URL}/dashboard.html" style="display:inline-block;background:#E8922A;color:#0A0A0F;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px;margin-bottom:32px">Go to Dashboard →</a>
    <hr style="border:none;border-top:1px solid #E8E4DC;margin-bottom:24px">
    <p style="font-size:13px;color:#6B6878">You can manage your subscription anytime from the Subscription tab in your dashboard. Questions? Reply to this email.</p>
    <p style="font-size:12px;color:#9CA3AF;margin-top:24px">© 2025 ReplyPilot · <a href="${BASE_URL}/privacy.html" style="color:#9CA3AF">Privacy</a> · <a href="${BASE_URL}/terms.html" style="color:#9CA3AF">Terms</a></p>
  </div>`;
}

module.exports = { sendEmail, welcomeEmail, passwordResetEmail, subscriptionEmail };
