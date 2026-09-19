const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPopupState,
  getAutoForceKey,
  getModeLabel,
  resolveTabStateForHost,
} = require("../state.js");

test("default rule follows global ON state and keeps mode editable", () => {
  const state = buildPopupState({
    globalEnabled: true,
    mode: "smart",
    siteRule: "default",
  });

  assert.equal(state.enabled, true);
  assert.equal(state.mode, "smart");
  assert.equal(state.modeLocked, false);
  assert.equal(state.weightDisabled, false);
  assert.equal(state.label, "ON");
  assert.match(state.detail, /グローバル既定/);
});

test("default rule becomes effectively OFF when global is OFF", () => {
  const state = buildPopupState({
    globalEnabled: false,
    mode: "force",
    siteRule: "default",
  });

  assert.equal(state.enabled, false);
  assert.equal(state.mode, "force");
  assert.equal(state.modeLocked, true);
  assert.equal(state.weightDisabled, true);
  assert.equal(state.label, "OFF");
  assert.equal(state.detail, "グローバル既定が OFF のため無効");
});

test("site smart rule forces Smart mode while keeping weight controls enabled", () => {
  const state = buildPopupState({
    globalEnabled: false,
    mode: "force",
    siteRule: "smart",
  });

  assert.equal(state.enabled, true);
  assert.equal(state.mode, "smart");
  assert.equal(state.modeLocked, true);
  assert.equal(state.weightDisabled, false);
  assert.equal(state.detail, "このサイトでは Smart ルールで有効");
});

test("site force rule forces Force mode while keeping weight controls enabled", () => {
  const state = buildPopupState({
    globalEnabled: false,
    mode: "smart",
    siteRule: "force",
  });

  assert.equal(state.enabled, true);
  assert.equal(state.mode, "force");
  assert.equal(state.modeLocked, true);
  assert.equal(state.weightDisabled, false);
  assert.equal(state.detail, "このサイトでは Force ルールで有効");
});

test("site disabled rule forces OFF regardless of global defaults", () => {
  const state = buildPopupState({
    globalEnabled: true,
    mode: "smart",
    siteRule: "disabled",
  });

  assert.equal(state.enabled, false);
  assert.equal(state.mode, "smart");
  assert.equal(state.modeLocked, true);
  assert.equal(state.weightDisabled, true);
  assert.equal(state.detail, "このサイトでは無効ルールを優先");
});

test("tab state follows site-specific smart rule even when global default is OFF", () => {
  const state = resolveTabStateForHost("example.com", {
    globalEnabled: false,
    mode: "force",
    siteRules: {
      "example.com": "smart",
    },
  });

  assert.deepEqual(state, {
    enabled: true,
    mode: "smart",
    reason: "site-smart",
  });
});

test("tab state follows global default for sites without explicit rule", () => {
  const state = resolveTabStateForHost("example.com", {
    globalEnabled: false,
    mode: "smart",
    siteRules: {},
  });

  assert.deepEqual(state, {
    enabled: false,
    mode: "smart",
    reason: "global-disabled",
  });
});

test("site auto rule enables Auto mode even when global default is OFF", () => {
  const state = buildPopupState({
    globalEnabled: false,
    mode: "smart",
    siteRule: "auto",
  });

  assert.equal(state.enabled, true);
  assert.equal(state.mode, "auto");
  assert.equal(state.reason, "site-auto");
  assert.equal(state.modeLocked, true);
  assert.equal(state.detail, "このサイトでは Auto ルールで有効");
  assert.equal(state.autoStatus, "pending");
});

test("global Auto mode reports the saved Force verdict", () => {
  const state = buildPopupState({
    globalEnabled: true,
    mode: "auto",
    siteRule: "default",
    autoForced: true,
  });

  assert.equal(state.enabled, true);
  assert.equal(state.mode, "auto");
  assert.equal(state.detail, "グローバル既定に従い Auto で有効");
  assert.equal(state.autoStatus, "forced");
});

test("saved Auto verdict is not reported when Auto is not effective", () => {
  const disabled = buildPopupState({
    globalEnabled: true,
    mode: "auto",
    siteRule: "disabled",
    autoForced: true,
  });
  const smart = buildPopupState({
    globalEnabled: true,
    mode: "auto",
    siteRule: "smart",
    autoForced: true,
  });

  assert.equal(disabled.autoStatus, null);
  assert.equal(smart.autoStatus, null);
});

test("tab state follows site-specific auto rule", () => {
  const state = resolveTabStateForHost("example.com", {
    globalEnabled: false,
    mode: "force",
    siteRules: {
      "example.com": "auto",
    },
  });

  assert.deepEqual(state, {
    enabled: true,
    mode: "auto",
    reason: "site-auto",
  });
});

test("Auto verdicts are stored under one key per domain", () => {
  assert.equal(getAutoForceKey("example.com"), "autoForce:example.com");
});

test("unknown mode labels fail loudly", () => {
  assert.equal(getModeLabel("auto"), "Auto");
  assert.throws(() => getModeLabel("bogus"), /Unknown mode: bogus/);
});
