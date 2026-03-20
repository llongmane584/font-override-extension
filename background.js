importScripts("state.js");

const DEFAULT_SETTINGS = {
  globalEnabled: false,
  mode: "smart",
  weightOffset: 0,
  siteRules: {},
};

const CONTENT_SCRIPT_ID = "font-override-jp-main";
const CONTENT_SCRIPT_FILE = "content.js";
const ACTION_ICON_SIZES = [16, 32, 48, 128];
const ACTION_ICON_CACHE = new Map();

function getSettings() {
  return chrome.storage.sync.get(DEFAULT_SETTINGS);
}

function isSupportedUrl(url) {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:" ||
      parsed.protocol === "file:"
    );
  } catch {
    return false;
  }
}

function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function getHostMatchPatterns(hostname) {
  if (!hostname) return [];

  return [`*://${hostname}/*`];
}

function resolveTabState(url, settings) {
  const hostname = getHostname(url);
  return globalThis.FontOverrideState.resolveTabStateForHost(hostname, settings);
}

function drawRoundedRect(ctx, size, fillStyle) {
  const radius = size * 0.22;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.quadraticCurveTo(size, 0, size, radius);
  ctx.lineTo(size, size - radius);
  ctx.quadraticCurveTo(size, size, size - radius, size);
  ctx.lineTo(radius, size);
  ctx.quadraticCurveTo(0, size, 0, size - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function createActionIcon(size, enabled) {
  const cacheKey = `${size}:${enabled ? "on" : "off"}`;
  const cached = ACTION_ICON_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  drawRoundedRect(ctx, size, enabled ? "#2563eb" : "#9ca3af");

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${Math.round(size * 0.58)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("F", size / 2, size / 2 + size * 0.03);

  if (!enabled) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.lineWidth = Math.max(2, size * 0.09);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(size * 0.24, size * 0.76);
    ctx.lineTo(size * 0.76, size * 0.24);
    ctx.stroke();
  }

  const imageData = ctx.getImageData(0, 0, size, size);
  ACTION_ICON_CACHE.set(cacheKey, imageData);
  return imageData;
}

function getActionIconSet(enabled) {
  return Object.fromEntries(
    ACTION_ICON_SIZES.map((size) => [size, createActionIcon(size, enabled)])
  );
}

async function updateActionIcon(tabId, state) {
  await chrome.action.setIcon({
    tabId,
    imageData: getActionIconSet(state.enabled),
  });
}

async function updateActionTitle(tabId, state) {
  const title = state.enabled
    ? `Font Override JP: ON (${state.mode === "force" ? "Force" : "Smart"})`
    : "Font Override JP: OFF";
  await chrome.action.setTitle({ tabId, title });
}

async function updateBadge(tabId, url, settings = null) {
  if (!isSupportedUrl(url)) {
    await chrome.action.setBadgeText({ text: "", tabId });
    await updateActionTitle(tabId, { enabled: false });
    await updateActionIcon(tabId, { enabled: false });
    return;
  }

  const resolvedSettings = settings || (await getSettings());
  const state = resolveTabState(url, resolvedSettings);
  const { enabled } = state;
  const text = enabled ? "" : "OFF";
  const color = enabled ? "#4CAF50" : "#9E9E9E";

  await chrome.action.setBadgeText({ text, tabId });
  await chrome.action.setBadgeBackgroundColor({ color, tabId });
  await updateActionTitle(tabId, state);
  await updateActionIcon(tabId, state);
}

async function registerContentScript() {
  const settings = await getSettings();
  const disabledHosts = Object.entries(settings.siteRules)
    .filter(([, rule]) => rule === "disabled")
    .flatMap(([hostname]) => getHostMatchPatterns(hostname));

  const explicitlyEnabledHosts = Object.entries(settings.siteRules)
    .filter(([, rule]) => rule === "smart" || rule === "force")
    .flatMap(([hostname]) => getHostMatchPatterns(hostname));

  const matches = settings.globalEnabled
    ? ["<all_urls>"]
    : Array.from(new Set(explicitlyEnabledHosts));

  try {
    await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  } catch {
    // Ignore if the script was not registered yet.
  }

  if (matches.length === 0) {
    return;
  }

  await chrome.scripting.registerContentScripts([
    {
      id: CONTENT_SCRIPT_ID,
      js: [CONTENT_SCRIPT_FILE],
      matches,
      excludeMatches: Array.from(new Set(disabledHosts)),
      runAt: "document_start",
      allFrames: false,
    },
  ]);
}

async function sendMessageIfPresent(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
    return true;
  } catch {
    return false;
  }
}

async function injectIntoTab(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_SCRIPT_FILE],
    });
  } catch {
    // Ignore unsupported or transient tab states.
  }
}

async function syncLiveTab(tabId, url, settings = null) {
  if (!isSupportedUrl(url)) {
    return;
  }

  const resolvedSettings = settings || (await getSettings());
  const { enabled } = resolveTabState(url, resolvedSettings);

  if (enabled) {
    const handled = await sendMessageIfPresent(tabId, {
      type: "font-override-jp:apply",
    });
    if (!handled) {
      await injectIntoTab(tabId);
    }
  } else {
    await sendMessageIfPresent(tabId, {
      type: "font-override-jp:teardown",
    });
  }
}

async function syncOpenTabs() {
  const settings = await getSettings();
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map(async (tab) => {
      if (typeof tab.id !== "number") return;
      await syncLiveTab(tab.id, tab.url, settings);
      await updateBadge(tab.id, tab.url, settings);
    })
  );
}

async function initialize() {
  const settings = await getSettings();
  await chrome.storage.sync.set(settings);
  await registerContentScript();
  await syncOpenTabs();
}

chrome.runtime.onInstalled.addListener(() => {
  initialize().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  initialize().catch(() => {});
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || Object.keys(changes).length === 0) {
    return;
  }

  registerContentScript()
    .then(syncOpenTabs)
    .catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "loading" && !changeInfo.url) {
    return;
  }

  const url = changeInfo.url || tab.url;
  if (!url) {
    return;
  }

  updateBadge(tabId, url).catch(() => {});
});
