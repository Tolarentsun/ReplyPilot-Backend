const fs = require('fs');
const path = require('path');

function splitLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function parseCSV(content) {
  const lines = content.trim().split('\n');
  const headers = splitLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = splitLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
  });
}

function toCSV(rows) {
  const headers = Object.keys(rows[0]);
  const cell = v => '"' + String(v ?? '').replace(/"/g, "'") + '"';
  return [headers.join(','), ...rows.map(r => headers.map(h => cell(r[h])).join(','))].join('\n');
}

const junk = new Set(['user@domain.com', 'jon.doe@email.com', 'test@test.com', 'example@example.com']);
const csvPath = path.resolve('leads-new-batch.csv');
const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'));
rows.forEach(r => { if (junk.has(r.email)) r.email = ''; });
fs.writeFileSync(csvPath, toCSV(rows));
const valid = rows.filter(r => r.email).length;
console.log('Valid emails after cleaning:', valid);
