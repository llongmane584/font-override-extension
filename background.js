const DEFAULT_SETTINGS = {
  globalEnabled: true,
  mode: "smart",
  weightOffset: 0,
  siteRules: {},
};

const CONTENT_SCRIPT_ID = "font-override-jp-main";
const CONTENT_SCRIPT_FILE = "content.js";

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
  const rule = settings.siteRules[hostname];

  if (rule === "disabled") {
    return { enabled: false };
  }

  if (rule === "force") {
    return { enabled: true };
  }

  return { enabled: Boolean(settings.globalEnabled) };
}

async function updateBadge(tabId, url, settings = null) {
  if (!isSupportedUrl(url)) {
    await chrome.action.setBadgeText({ text: "", tabId });
    return;
  }

  const resolvedSettings = settings || (await getSettings());
  const { enabled } = resolveTabState(url, resolvedSettings);
  const text = enabled ? "" : "OFF";
  const color = enabled ? "#4CAF50" : "#9E9E9E";

  await chrome.action.setBadgeText({ text, tabId });
  await chrome.action.setBadgeBackgroundColor({ color, tabId });
}

async function registerContentScript() {
  const settings = await getSettings();
  const disabledHosts = Object.entries(settings.siteRules)
    .filter(([, rule]) => rule === "disabled")
    .flatMap(([hostname]) => getHostMatchPatterns(hostname));

  const forcedHosts = Object.entries(settings.siteRules)
    .filter(([, rule]) => rule === "force")
    .flatMap(([hostname]) => getHostMatchPatterns(hostname));

  const matches = settings.globalEnabled
    ? ["<all_urls>"]
    : Array.from(new Set(forcedHosts));

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
