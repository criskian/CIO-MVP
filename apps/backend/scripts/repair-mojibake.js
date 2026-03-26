/**
 * One-time repair script: fixes mojibake in TypeScript source files.
 * Run from project root: node apps/backend/scripts/repair-mojibake.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');

// Detection
function countSuspicious(str) {
  let n = 0;
  for (const ch of str) {
    const cp = ch.codePointAt(0) || 0;
    if (cp === 0x00c2 || cp === 0x00c3 || cp === 0x00e2 ||
        cp === 0x00c5 || cp === 0x00f0 || cp === 0xfffd) n++;
  }
  return n;
}

// Iterative latin1->utf8 decode to find the version with fewest suspicious chars
function repairText(text) {
  if (!text) return text;
  let best = text;
  let bestScore = countSuspicious(text);
  const seen = new Set([text]);
  let frontier = [text];

  for (let i = 0; i < 8; i++) {
    const next = [];
    for (const cand of frontier) {
      let decoded;
      try { decoded = Buffer.from(cand, 'latin1').toString('utf8'); } catch { continue; }
      if (!decoded || seen.has(decoded)) continue;
      seen.add(decoded);
      next.push(decoded);
      const s = countSuspicious(decoded);
      if (s < bestScore) { best = decoded; bestScore = s; }
    }
    if (!next.length) break;
    frontier = next;
  }

  // Apply final known replacements (bad -> good), all as plain hex escapes
  const T = [
    // Spanish accented chars
    ['\u00C3\u00A1', '\u00E1'], // a-acute
    ['\u00C3\u00A9', '\u00E9'], // e-acute
    ['\u00C3\u00AD', '\u00ED'], // i-acute
    ['\u00C3\u00B3', '\u00F3'], // o-acute
    ['\u00C3\u00BA', '\u00FA'], // u-acute
    ['\u00C3\u00B1', '\u00F1'], // n-tilde
    ['\u00C3\u0081', '\u00C1'], // A-acute
    ['\u00C3\u0089', '\u00C9'], // E-acute
    ['\u00C3\u008D', '\u00CD'], // I-acute
    ['\u00C3\u0093', '\u00D3'], // O-acute
    ['\u00C3\u009A', '\u00DA'], // U-acute
    ['\u00C3\u0091', '\u00D1'], // N-tilde
    ['\u00C3\u00BC', '\u00FC'], // u-umlaut
    ['\u00C3\u009C', '\u00DC'], // U-umlaut
    ['\u00C2\u00BF', '\u00BF'], // inverted ?
    ['\u00C2\u00A1', '\u00A1'], // inverted !
    ['\u00C2\u00B0', '\u00B0'], // degree
    ['\u00C2\u00A0', '\u00A0'], // nbsp
    // Punctuation / symbols
    ['\u00E2\u0080\u00A2', '\u2022'], // bullet
    ['\u00E2\u0080\u00A6', '\u2026'], // ellipsis
    ['\u00E2\u0080\u009C', '\u201C'], // left "
    ['\u00E2\u0080\u009D', '\u201D'], // right "
    ['\u00E2\u0080\u0098', '\u2018'], // left '
    ['\u00E2\u0080\u0099', '\u2019'], // right '
    ['\u00E2\u0086\u0092', '\u2192'], // arrow ->
    // Common emoji (latin1 double-decoded forms)
    ['\u00E2\u009C\u0085', '\u2705'],         // checkmark
    ['\u00E2\u009D\u008C', '\u274C'],         // cross X
    ['\u00E2\u009C\u00A8', '\u2728'],         // sparkles
    ['\u00E2\u009C\u008F\uFE0F', '\u270F\uFE0F'], // pencil
    ['\u00E2\u0098\u0085', '\u2605'],         // star
    ['\u00E2\u008F\u0080', '\u23F0'],         // alarm
    // Replacement char sequences
    ['\u00EF\u00BF\u00BD', ''],
    ['\u00C3\u00AF\u00C2\u00BF\u00C2\u00BD', ''],
  ];

  let result = best;
  for (const [bad, good] of T) {
    if (result.includes(bad)) result = result.split(bad).join(good);
  }

  // Remove control chars (except tab, newline, cr)
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return result;
}

// Files to repair (relative to project root)
const FILES = [
  'apps/backend/src/modules/conversation/helpers/bot-messages.ts',
  'apps/backend/src/modules/conversation/conversation.service.ts',
  'apps/backend/src/modules/scheduler/scheduler.service.ts',
];

const ROOT = path.resolve(__dirname, '../../..');

for (const rel of FILES) {
  const filePath = path.join(ROOT, rel);
  if (!fs.existsSync(filePath)) { console.warn('[SKIP] Not found: ' + rel); continue; }

  const original = fs.readFileSync(filePath, 'utf8');
  const repaired = repairText(original);

  if (repaired === original) { console.log('[OK]   No changes: ' + rel); continue; }

  let diffs = 0;
  const len = Math.max(original.length, repaired.length);
  for (let i = 0; i < len; i++) { if (original[i] !== repaired[i]) diffs++; }

  fs.writeFileSync(filePath, repaired, 'utf8');
  console.log('[FIXED] ' + rel + '  (~' + diffs + ' chars changed)');
}

console.log('\nDone. Rebuild the backend to apply changes.');
