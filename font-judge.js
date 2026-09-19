(function initializeFontJudge(root) {
  // font-family values that should NOT be overridden (icon fonts etc.)
  const PRESERVE_PATTERNS = [
    /font\s*awesome/i,
    /material\s*(icons|symbols)/i,
    /bootstrap\s*icons/i,
    /ionicons/i,
    /glyphicons/i,
    /remixicon/i,
    /lucide/i,
    /phosphor/i,
    /tabler/i,
    /codicon/i,
    /icomoon/i,
    /icon/i,
    /emoji/i,
    /monospace/i,
    /mono\b/i,
    /\bconsolas\b/i,
    /\bcourier/i,
    /\bmenlo\b/i,
    /\bfira\s*code/i,
    /\bjb\s*mono/i,
    /\bsource\s*code/i,
  ];

  // Japanese fonts bundled with Windows. Matched by exact name or "<name> <variant>".
  const WINDOWS_JP_FONTS = [
    "yu gothic",
    "游ゴシック",
    "meiryo",
    "メイリオ",
    "ms pgothic",
    "ms gothic",
    "ms ui gothic",
    "ｍｓ ｐゴシック",
    "ｍｓ ゴシック",
  ];

  // Japanese fonts that look fine on Windows (Noto Sans JP is assumed installed).
  const GOOD_JP_FONTS = [
    "noto sans jp",
    "noto sans cjk jp",
    "source han sans",
    "源ノ角ゴシック",
    "biz udpgothic",
    "biz udgothic",
    "biz udpゴシック",
    "biz udゴシック",
  ];

  // Generic families that resolve to a Windows bundled Japanese gothic font
  const POOR_GENERIC_FAMILIES = ["sans-serif", "system-ui"];

  // Intentional non-gothic designs; the page is not "poor" because of them
  const OTHER_GENERIC_FAMILIES = ["serif", "cursive", "fantasy"];
  const MINCHO_PATTERN = /mincho|明朝/;

  const KANA_PATTERN = /[\u3041-\u3096\u30a1-\u30fa\u30fc\uff66-\uff9d]/g;
  const PRIVATE_USE_PATTERN = /[\ue000-\uf8ff]/;
  const KANA_PROBE_CODE_POINT = 0x3042; // "あ"

  const MIN_KANA_FOR_VERDICT = 20;

  function normalizeFamily(family) {
    return family
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function parseFontFamilyList(value) {
    if (!value) return [];
    return value
      .split(",")
      .map(normalizeFamily)
      .filter((family) => family.length > 0);
  }

  function matchesFontName(family, names) {
    return names.some((name) => family === name || family.startsWith(`${name} `));
  }

  // Force / Auto judge by the primary family: a stack like
  // "Segoe UI, ..., Segoe UI Emoji" is body text even though it contains an
  // emoji fallback. (Smart's shouldOverride still tests the whole string.)
  function isPreservedFontStack(families) {
    if (families.length === 0) return false;
    return (
      PRESERVE_PATTERNS.some((pattern) => pattern.test(families[0])) ||
      families.includes("monospace")
    );
  }

  function hasPrivateUseChar(text) {
    return PRIVATE_USE_PATTERN.test(text);
  }

  function parseCodePoint(hex) {
    const codePoint = Number.parseInt(hex, 16);
    if (Number.isNaN(codePoint)) {
      throw new Error(`Invalid unicode-range code point: ${hex}`);
    }
    return codePoint;
  }

  function unicodeRangeCovers(unicodeRange, codePoint) {
    return unicodeRange.split(",").some((token) => {
      const range = token.trim().replace(/^u\+/i, "");
      if (range.includes("?")) {
        return (
          parseCodePoint(range.replace(/\?/g, "0")) <= codePoint &&
          codePoint <= parseCodePoint(range.replace(/\?/g, "F"))
        );
      }
      const [start, end = start] = range.split("-");
      return parseCodePoint(start) <= codePoint && codePoint <= parseCodePoint(end);
    });
  }

  function collectJapaneseWebFontFamilies(fontFaces) {
    const families = new Set();
    for (const face of fontFaces) {
      if (face.status === "error") continue;
      if (!unicodeRangeCovers(face.unicodeRange, KANA_PROBE_CODE_POINT)) continue;
      families.add(normalizeFamily(face.family));
    }
    return families;
  }

  // Guess which family renders Japanese text on Windows.
  // "poor": a Windows bundled gothic font, "ok": anything else,
  // "ignore": icon / monospace text that Force leaves untouched anyway.
  function classifyFontStack(families, japaneseWebFonts) {
    if (isPreservedFontStack(families)) return "ignore";

    for (const family of families) {
      if (japaneseWebFonts.has(family)) return "ok";
      if (matchesFontName(family, GOOD_JP_FONTS)) return "ok";
      if (matchesFontName(family, WINDOWS_JP_FONTS)) return "poor";
      if (POOR_GENERIC_FAMILIES.includes(family)) return "poor";
      if (OTHER_GENERIC_FAMILIES.includes(family) || MINCHO_PATTERN.test(family)) {
        return "ok";
      }
      // Otherwise the family is missing on Windows (Hiragino, -apple-system, ...)
      // or has no Japanese glyphs (Segoe UI, Latin-only web fonts): try the next one.
    }

    // Nothing matched: the browser's default Japanese font is used.
    return "poor";
  }

  function countKana(text) {
    const matches = text.match(KANA_PATTERN);
    return matches ? matches.length : 0;
  }

  function judgeKanaStats({ poor, ok }) {
    if (poor + ok < MIN_KANA_FOR_VERDICT) return "undecided";
    return poor > ok ? "force" : "keep";
  }

  const api = {
    PRESERVE_PATTERNS,
    classifyFontStack,
    collectJapaneseWebFontFamilies,
    countKana,
    hasPrivateUseChar,
    isPreservedFontStack,
    judgeKanaStats,
    parseFontFamilyList,
    unicodeRangeCovers,
  };

  root.FontOverrideJudge = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
