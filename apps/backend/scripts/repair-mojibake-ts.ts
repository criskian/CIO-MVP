/**
 * Proper mojibake repair using the project's own repairMojibakeText + iconv-lite.
 * Run from apps/backend:
 *   npx ts-node scripts/repair-mojibake-ts.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { repairMojibakeText } from '../src/common/text/mojibake.util';

const FILES = [
  'src/modules/conversation/helpers/bot-messages.ts',
  'src/modules/conversation/conversation.service.ts',
  'src/modules/scheduler/scheduler.service.ts',
];

const ROOT = path.resolve(__dirname, '..');

for (const rel of FILES) {
  const filePath = path.join(ROOT, rel);
  if (!fs.existsSync(filePath)) {
    console.warn('[SKIP] Not found: ' + rel);
    continue;
  }

  const original = fs.readFileSync(filePath, 'utf8');
  const repaired = repairMojibakeText(original);

  if (repaired === original) {
    console.log('[OK]   No changes: ' + rel);
    continue;
  }

  let diffs = 0;
  for (let i = 0; i < Math.max(original.length, repaired.length); i++) {
    if (original[i] !== repaired[i]) diffs++;
  }

  fs.writeFileSync(filePath, repaired, 'utf8');
  console.log(`[FIXED] ${rel}  (~${diffs} chars changed)`);
}

console.log('\nDone.');
