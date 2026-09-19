const test = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyFontStack,
  collectJapaneseWebFontFamilies,
  countKana,
  hasPrivateUseChar,
  isPreservedFontStack,
  judgeKanaStats,
  parseFontFamilyList,
  unicodeRangeCovers,
} = require("../font-judge.js");

const NO_WEB_FONTS = new Set();

function classify(fontFamily, webFonts = NO_WEB_FONTS) {
  return classifyFontStack(parseFontFamilyList(fontFamily), webFonts);
}

test("computed font-family is split into normalized family names", () => {
  assert.deepEqual(
    parseFontFamilyList('-apple-system, "Hiragino Sans", "Yu  Gothic UI", sans-serif'),
    ["-apple-system", "hiragino sans", "yu gothic ui", "sans-serif"]
  );
  assert.deepEqual(parseFontFamilyList(""), []);
});

test("Mac-only and Latin-only families fall through to the Windows Japanese font", () => {
  assert.equal(
    classify('-apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", Meiryo, sans-serif'),
    "poor"
  );
  assert.equal(classify('"Hiragino Kaku Gothic ProN", "游ゴシック Medium", sans-serif'), "poor");
  assert.equal(classify('"ＭＳ Ｐゴシック", sans-serif'), "poor");
  assert.equal(classify("system-ui"), "poor");
});

test("a stack without any usable Japanese family uses the browser default", () => {
  assert.equal(classify('"Helvetica Neue", Arial'), "poor");
});

test("good Japanese fonts stop the search before Windows fonts", () => {
  assert.equal(classify('"Noto Sans JP", Meiryo, sans-serif'), "ok");
  assert.equal(classify('Arial, "BIZ UDPGothic", sans-serif'), "ok");
  assert.equal(classify('"Source Han Sans JP", "Yu Gothic", sans-serif'), "ok");
});

test("a Japanese web font counts as a deliberate design", () => {
  const webFonts = new Set(["zen kaku gothic new"]);
  assert.equal(classify('"Zen Kaku Gothic New", Meiryo, sans-serif', webFonts), "ok");
});

test("Windows font names only match whole words", () => {
  // "游ゴシック体" is the macOS name and does not exist on Windows
  assert.equal(classify('"游ゴシック体", "Noto Sans JP"'), "ok");
  assert.equal(classify('"Meiryo UI", "Noto Sans JP"'), "poor");
});

test("serif and mincho designs are not treated as poor", () => {
  assert.equal(classify('"Hiragino Mincho ProN", "Yu Mincho", serif'), "ok");
  assert.equal(classify("serif"), "ok");
});

test("icon and monospace stacks are ignored", () => {
  assert.equal(classify('"Font Awesome 6 Free"'), "ignore");
  assert.equal(classify('icomoon'), "ignore");
  assert.equal(classify('Consolas, "MS Gothic", monospace'), "ignore");
});

test("emoji fallbacks do not make body text a preserved stack", () => {
  const families = parseFontFamilyList(
    '-apple-system, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"'
  );
  assert.equal(isPreservedFontStack(families), false);
  assert.equal(isPreservedFontStack(parseFontFamilyList('"Segoe UI Emoji"')), true);
  assert.equal(isPreservedFontStack(parseFontFamilyList("bootstrap-icons")), true);
  assert.equal(isPreservedFontStack([]), false);
});

test("unicode-range coverage handles single points, ranges and wildcards", () => {
  assert.equal(unicodeRangeCovers("U+0-10FFFF", 0x3042), true);
  assert.equal(unicodeRangeCovers("U+0000-00FF, U+0131, U+2000-206F", 0x3042), false);
  assert.equal(unicodeRangeCovers("U+25EE8, U+3041-3096, U+30A0-30FF", 0x3042), true);
  assert.equal(unicodeRangeCovers("u+30??", 0x3042), true);
  assert.equal(unicodeRangeCovers("U+3042", 0x3042), true);
  assert.throws(() => unicodeRangeCovers("U+ZZZZ", 0x3042), /Invalid unicode-range/);
});

test("only loadable web fonts that cover kana are collected", () => {
  const families = collectJapaneseWebFontFamilies([
    { family: '"Noto Sans JP"', status: "loaded", unicodeRange: "U+3041-3096" },
    { family: "Roboto", status: "loaded", unicodeRange: "U+0000-00FF" },
    { family: '"Broken JP"', status: "error", unicodeRange: "U+0-10FFFF" },
    { family: "'Lazy JP'", status: "unloaded", unicodeRange: "U+0-10FFFF" },
  ]);
  assert.deepEqual([...families].sort(), ["lazy jp", "noto sans jp"]);
});

test("kana are counted while kanji-only (possibly Chinese) text is not", () => {
  assert.equal(countKana("ひらがなとカタカナ、ｶﾀｶﾅ"), 13);
  assert.equal(countKana("中文页面"), 0);
  assert.equal(countKana("English"), 0);
});

test("private use area characters identify icon glyphs", () => {
  assert.equal(hasPrivateUseChar('""'), true);
  assert.equal(hasPrivateUseChar('"→"'), false);
});

test("Force is chosen only when poor text is the majority of enough kana", () => {
  assert.equal(judgeKanaStats({ poor: 19, ok: 0 }), "undecided");
  assert.equal(judgeKanaStats({ poor: 20, ok: 0 }), "force");
  assert.equal(judgeKanaStats({ poor: 60, ok: 40 }), "force");
  assert.equal(judgeKanaStats({ poor: 50, ok: 50 }), "undecided");
  assert.equal(judgeKanaStats({ poor: 1000, ok: 2000 }), "keep");
});
