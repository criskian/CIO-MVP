import * as iconv from 'iconv-lite';

const CONTROL_CHARS_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const CLASSIC_MOJIBAKE_CODEPOINTS = new Set<number>([
  0x00c2, 0x00c3, 0x00e2, 0x00c5, 0x00f0, 0xfffd,
]);
const DEEP_MOJIBAKE_CODEPOINTS = new Set<number>([
  0x00c2, 0x00c3, 0x00e2, 0x00f0, 0x0192, 0x00c6,
  0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e,
  0x2020, 0x2021, 0x2022, 0x2026, 0x2013, 0x2014,
  0x20ac, 0x2122, 0x0160, 0x0161, 0x017d, 0x017e,
  0x0152, 0x0153, 0x02c6, 0x02dc, 0x2030, 0x2039,
  0x203a, 0x00a0, 0x00a1, 0x00a2, 0x00ac, 0x00b3,
]);

function countSuspiciousChars(value: string): number {
  let count = 0;
  for (const char of value) {
    if (CLASSIC_MOJIBAKE_CODEPOINTS.has(char.codePointAt(0) || 0)) {
      count += 1;
    }
  }
  return count;
}

function countDeepMojibakeTokens(value: string): number {
  let count = 0;
  for (const char of value) {
    if (DEEP_MOJIBAKE_CODEPOINTS.has(char.codePointAt(0) || 0)) {
      count += 1;
    }
  }
  return count;
}

function safeDecodeAsUtf8(value: string, sourceEncoding: 'latin1' | 'win1252'): string {
  try {
    const bytes = iconv.encode(value, sourceEncoding);
    return bytes.toString('utf8');
  } catch {
    return value;
  }
}

function scoreCandidate(value: string): number {
  const replacementChars = (value.match(/\uFFFD/g) || []).length;
  const controlChars = (value.match(CONTROL_CHARS_PATTERN) || []).length;
  const classicSuspicious = countSuspiciousChars(value);
  const deepSuspicious = countDeepMojibakeTokens(value);
  const longQuestionMarks = (value.match(/\?{2,}/g) || [])
    .reduce((total, segment) => total + segment.length, 0);

  return (replacementChars * 1000)
    + (controlChars * 250)
    + (classicSuspicious * 30)
    + (deepSuspicious * 10)
    + (longQuestionMarks * 120);
}

function applyKnownMojibakeReplacements(value: string): string {
  let result = value;

  const replacements: Array<[string, string]> = [
    ['ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã‚Â', '\u{1F4DD}'],
    ['ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ‚Â¹', '\u{1F539}'],
    ['ÃƒÂ°Ã…Â¸Ã¢â‚¬â„¢Ã‚Â¡', '\u{1F4A1}'],
    ['ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã‚Â', '\u{1F4CD}'],
    ['ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ‚Â', '\u{1F50D}'],
    ['ÃƒÂ°Ã…Â¸â€œÂ¬', '\u{1F4EC}'],
    ['ÃƒÂ°Ã…Â¸â€œâ€¹', '\u{1F4CB}'],
    ['ÃƒÂ°Ã…Â¸â€Ëœ', '\u{1F518}'],
    ['ÃƒÂ°Ã…Â¸â€™Â¾', '\u{1F4BE}'],
    ['ÃƒÂ°Ã…Â¸â€™Â¬', '\u{1F4AC}'],
    ['ÃƒÂ¢Ã‚ÂÃ‚Â°', '\u23F0'],
    ['ÃƒÂ¢Ã‚ÂÃ…â€™', '\u274C'],
    ['ÃƒÂ¢Å“â€¦', '\u2705'],
    ['ÃƒÂ¢Å¡Â Ã¯Â¸Â', '\u26A0\uFE0F'],
    ['ÃƒÂ¢Å“Â¨', '\u2728'],
    ['ÃƒÂ¢â‚¬Â¢', '\u2022'],
    ['ÃƒÂ¢â‚¬Â¦', '...'],
    ['ÃƒÂ¢â‚¬Å“', '"'],
    ['ÃƒÂ¢â‚¬Â', '"'],
    ['ÃƒÂ¢â‚¬â„¢', "'"],

    ['ðŸ“', '\u{1F4DD}'],
    ['ðŸ”¹', '\u{1F539}'],
    ['ðŸ’¡', '\u{1F4A1}'],
    ['ðŸ“', '\u{1F4CD}'],
    ['ðŸ”', '\u{1F50D}'],
    ['ðŸ“¬', '\u{1F4EC}'],
    ['ðŸ“‹', '\u{1F4CB}'],
    ['ðŸ”˜', '\u{1F518}'],
    ['ðŸ’¾', '\u{1F4BE}'],
    ['ðŸ’¬', '\u{1F4AC}'],
    ['â°', '\u23F0'],
    ['âŒ', '\u274C'],
    ['âœ…', '\u2705'],
    ['âš ï¸', '\u26A0\uFE0F'],
    ['âœ¨', '\u2728'],
    ['â€¢', '\u2022'],
    ['â€¦', '...'],
    ['â€œ', '"'],
    ['â€', '"'],
    ['â€˜', "'"],
    ['â€™', "'"],
    ['â†’', '\u2192'],

    ['ÃƒÂ¡', '\u00E1'],
    ['ÃƒÂ©', '\u00E9'],
    ['ÃƒÂ­', '\u00ED'],
    ['ÃƒÂ³', '\u00F3'],
    ['ÃƒÂº', '\u00FA'],
    ['ÃƒÂ', '\u00C1'],
    ['Ãƒâ€°', '\u00C9'],
    ['ÃƒÂ', '\u00CD'],
    ['Ãƒâ€œ', '\u00D3'],
    ['ÃƒÅ¡', '\u00DA'],
    ['ÃƒÂ±', '\u00F1'],
    ['Ãƒâ€˜', '\u00D1'],
    ['ÃƒÂ¼', '\u00FC'],
    ['ÃƒÅ“', '\u00DC'],
    ['Ã‚Â¿', '\u00BF'],
    ['Ã‚Â¡', '\u00A1'],
    ['Ã‚Â°', '\u00B0'],
    ['Ã‚', ''],

    ['Ã¡', '\u00E1'],
    ['Ã©', '\u00E9'],
    ['Ã­', '\u00ED'],
    ['Ã³', '\u00F3'],
    ['Ãº', '\u00FA'],
    ['Ã±', '\u00F1'],
    ['Ã', '\u00C1'],
    ['Ã‰', '\u00C9'],
    ['Ã', '\u00CD'],
    ['Ã“', '\u00D3'],
    ['Ãš', '\u00DA'],
    ['Ã‘', '\u00D1'],
    ['Â¿', '\u00BF'],
    ['Â¡', '\u00A1'],

    ['Ã¯Â¿Â½', ''],
    ['ï¿½', ''],
    ['CuÃ¯Â¿Â½ntame', 'Cu\u00E9ntame'],
    ['por quÃ¯Â¿Â½', 'por qu\u00E9'],
    ['interesÃ¯Â¿Â½', 'interes\u00F3'],
    ['bÃ¯Â¿Â½squeda', 'b\u00FAsqueda'],
    ['bÃ¯Â¿Â½squedas', 'b\u00FAsquedas'],
    ['segÃ¯Â¿Â½n', 'seg\u00FAn'],
    ['opciÃ¯Â¿Â½n', 'opci\u00F3n'],
    ['ubicaciÃ¯Â¿Â½n', 'ubicaci\u00F3n'],
    ['notificaciÃ¯Â¿Â½n', 'notificaci\u00F3n'],
    ['mÃ¯Â¿Â½s', 'm\u00E1s'],
    ['No encontrÃ¯Â¿Â½', 'No encontr\u00E9'],
    ['solicitÃ¯Â¿Â½', 'solicit\u00F3'],
    ['interacciÃ¯Â¿Â½n', 'interacci\u00F3n'],
    ['podrÃ¯Â¿Â½as', 'podr\u00EDas'],
    ['completÃ¯Â¿Â½', 'complet\u00F3'],
    ['tÃ¯Â¿Â½rminos', 't\u00E9rminos'],
    ['ediciÃ¯Â¿Â½n', 'edici\u00F3n'],
  ];

  for (const [from, to] of replacements) {
    result = result.split(from).join(to);
  }

  return result;
}

export function repairMojibakeText(text: string): string {
  if (!text) return text;

  // Early exit: if no classic mojibake indicators are present, the text is already clean.
  // Without this guard, the iterative latin1 decode loop converts clean chars (✅, •, á) to
  // their double-decoded forms which score 0, incorrectly "winning" over the original.
  const hasClassicMojibake = countSuspiciousChars(text) > 0 || text.includes('\uFFFD');
  if (!hasClassicMojibake) {
    return applyKnownMojibakeReplacements(text).replace(CONTROL_CHARS_PATTERN, '');
  }

  let best = text;
  let bestScore = scoreCandidate(text);
  const seen = new Set<string>([text]);
  let frontier = [text];

  for (let i = 0; i < 8; i += 1) {
    const nextFrontier: string[] = [];

    for (const candidate of frontier) {
      const options = [
        safeDecodeAsUtf8(candidate, 'latin1'),
        safeDecodeAsUtf8(candidate, 'win1252'),
      ];

      for (const option of options) {
        if (!option || seen.has(option)) continue;
        seen.add(option);
        nextFrontier.push(option);

        const optionScore = scoreCandidate(option);
        if (optionScore < bestScore) {
          best = option;
          bestScore = optionScore;
        }
      }
    }

    if (nextFrontier.length === 0) break;
    frontier = nextFrontier;
  }

  return applyKnownMojibakeReplacements(best).replace(CONTROL_CHARS_PATTERN, '');
}

export function sanitizeUnknownForLogs(input: unknown): unknown {
  if (typeof input === 'string') return repairMojibakeText(input);
  if (Array.isArray(input)) return input.map((item) => sanitizeUnknownForLogs(item));
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      out[key] = sanitizeUnknownForLogs(value);
    }
    return out;
  }
  return input;
}
