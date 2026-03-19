// Initialise default settings on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(
    { globalEnabled: true, mode: "smart", siteRules: {} },
    (data) => {
      chrome.storage.sync.set(data);
    }
  );
});

// Update badge to reflect state
function updateBadge(tabId, enabled) {
  const text = enabled ? "" : "OFF";
  const color = enabled ? "#4CAF50" : "#9E9E9E";
  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color, tabId });
}

// When a tab is updated, check site rule and set badge
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    try {
      const url = new URL(tab.url);
      chrome.storage.sync.get(
        { globalEnabled: true, siteRules: {} },
        (data) => {
          const rule = data.siteRules[url.hostname];
          const enabled = rule === "disabled" ? false : data.globalEnabled;
          updateBadge(tabId, enabled);
        }
      );
    } catch {
      // ignore non-http URLs
    }
  }
});
