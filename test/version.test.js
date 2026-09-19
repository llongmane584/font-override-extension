const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// バージョンの置き場所は manifest.json だけ。CHANGELOG.md の先頭の版との一致を
// ここで縛る —— version++ を手でやるうちは片方だけ上げる事故が起きる。
// 手順は docs/RELEASE.md。

const ROOT = path.join(__dirname, "..");
const HEADING = /^## (\d+\.\d+\.\d+) - (\d{4}-\d{2}-\d{2})$/;
// Chrome の version は数字とドットだけ。各部に先頭ゼロは書けず、上限は 65535。
const CHROME_VERSION = /^(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})$/;

function readManifestVersion() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  return manifest.version;
}

function readChangelog() {
  const lines = fs.readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8").split("\n");
  const entries = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      const match = line.match(HEADING);
      if (!match) {
        throw new Error(`CHANGELOG.md の見出しは "## X.Y.Z - YYYY-MM-DD" の形で書く: ${line}`);
      }
      entries.push({ version: match[1], date: match[2], notes: [] });
    } else if (line.startsWith("- ") && entries.length > 0) {
      entries[entries.length - 1].notes.push(line);
    }
  }

  if (entries.length === 0) {
    throw new Error("CHANGELOG.md から版を 1 つも読めなかった");
  }
  return entries;
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

test("manifest version is X.Y.Z that Chrome accepts", () => {
  const version = readManifestVersion();
  const match = version.match(CHROME_VERSION);

  assert.ok(match, `manifest.json の version が X.Y.Z ではない: ${version}`);
  for (const part of match.slice(1)) {
    assert.ok(Number(part) <= 65535, `各部は 65535 以下: ${version}`);
  }
});

test("manifest version matches the newest changelog entry", () => {
  assert.equal(readManifestVersion(), readChangelog()[0].version);
});

test("every changelog entry carries a real ISO 8601 date", () => {
  for (const entry of readChangelog()) {
    const date = new Date(`${entry.date}T00:00:00Z`);
    assert.equal(date.toISOString().slice(0, 10), entry.date, `${entry.version} の日付が不正`);
  }
});

test("changelog entries are newest first", () => {
  const entries = readChangelog();

  for (let i = 1; i < entries.length; i += 1) {
    const newer = entries[i - 1];
    const older = entries[i];
    assert.ok(
      compareVersions(newer.version, older.version) > 0,
      `${newer.version} は ${older.version} より新しい版でなければならない`
    );
    assert.ok(newer.date >= older.date, `${newer.version} の日付が ${older.version} より古い`);
  }
});

test("every changelog entry has notes", () => {
  for (const entry of readChangelog()) {
    assert.ok(entry.notes.length > 0, `${entry.version} にノートが無い`);
  }
});
