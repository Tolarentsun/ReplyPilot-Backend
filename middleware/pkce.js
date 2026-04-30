const crypto = require('crypto');

// Short-lived in-memory store for PKCE verifiers (TTL: 10 minutes)
const store = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, { expires }] of store) {
    if (now > expires) store.delete(key);
  }
}, 60000).unref();

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const key = crypto.randomBytes(16).toString('hex');
  store.set(key, { verifier, expires: Date.now() + 10 * 60 * 1000 });
  return { key, challenge };
}

// Retrieves and deletes the verifier (single-use)
function consumePKCE(key) {
  if (!key) return null;
  const entry = store.get(key);
  if (!entry) return null;
  store.delete(key);
  return entry.verifier;
}

module.exports = { generatePKCE, consumePKCE };
