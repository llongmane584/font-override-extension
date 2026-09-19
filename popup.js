document.addEventListener("DOMContentLoaded", async () => {
  const globalToggle = document.getElementById("globalToggle");
  const modeSelect = document.getElementById("modeSelect");
  const hostnameEl = document.getElementById("hostname");
  const siteRule = document.getElementById("siteRule");
  const weightSlider = document.getElementById("weightSlider");
  const weightValue = document.getElementById("weightValue");
  const weightReset = document.getElementById("weightReset");
  const previewNormal = document.getElementById("previewNormal");
  const previewBold = document.getElementById("previewBold");
  const effectiveStatePill = document.getElementById("effectiveStatePill");
  const effectiveStateDetail = document.getElementById("effectiveStateDetail");
  const autoStatusEl = document.getElementById("autoStatus");
  const autoStatusText = document.getElementById("autoStatusText");
  const autoRejudge = document.getElementById("autoRejudge");
  const weightSection = weightSlider.closest(".section");
  const modeRow = modeSelect.closest(".row");
  let globalMode = "smart";
  let isWeightSiteSpecific = false;
  let autoForced = false;
  const weightSourceEl = document.getElementById("weightSource");

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function formatOffset(v) {
    if (v === 0) return "±0";
    return v > 0 ? `+${v}` : String(v);
  }

  function updateWeightSourceIndicator() {
    if (!weightSourceEl) return;
    if (isWeightSiteSpecific) {
      weightSourceEl.textContent = "このサイト固有の設定";
      weightSourceEl.classList.add("source-site");
    } else {
      weightSourceEl.textContent = "未設定";
      weightSourceEl.classList.remove("source-site");
    }
  }

  function updateWeightPreview(offset) {
    const n = clamp(400 + offset, 1, 1000);
    const b = clamp(700 + offset, 1, 1000);
    previewNormal.style.fontWeight = n;
    previewNormal.textContent = `通常(${n})`;
    previewBold.style.fontWeight = b;
    previewBold.textContent = `太字(${b})`;
  }

  function getEffectiveState() {
    return globalThis.FontOverrideState.buildPopupState({
      globalEnabled: globalToggle.checked,
      mode: globalMode,
      siteRule: siteRule.value,
      autoForced,
    });
  }

  function updateAutoStatus(autoStatus) {
    autoStatusEl.hidden = autoStatus === null;
    autoStatusEl.classList.toggle("auto-forced", autoStatus === "forced");
    autoRejudge.hidden = autoStatus !== "forced";
    if (autoStatus === "forced") {
      autoStatusText.textContent = "自動判定: Windows 標準フォントを検出し Force を適用中";
    } else if (autoStatus === "pending") {
      autoStatusText.textContent = "自動判定: 見づらいフォントは未検出";
    }
  }

  function updateControlsState() {
    const state = getEffectiveState();
    const weightDisabled = !state.enabled;

    modeSelect.value = state.mode;
    modeSelect.disabled = state.modeLocked;
    weightSlider.disabled = weightDisabled;
    weightReset.disabled = weightDisabled;
    effectiveStatePill.textContent = state.label;
    effectiveStatePill.classList.toggle("state-on", state.enabled);
    effectiveStatePill.classList.toggle("state-off", !state.enabled);
    effectiveStateDetail.textContent = state.detail;
    updateAutoStatus(state.autoStatus);

    modeRow.classList.toggle("controls-disabled", state.modeLocked);
    weightSection.classList.toggle("controls-disabled", weightDisabled);
  }

  // Get current tab domain
  let currentTabId = null;
  let currentDomain = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = tab?.id ?? null;
    if (tab?.url) {
      const url = new URL(tab.url);
      currentDomain = globalThis.FontOverrideDomain.extractDomain(url.hostname);
      hostnameEl.textContent = currentDomain;
    }
  } catch {
    hostnameEl.textContent = "(不明)";
  }

  // Initial disabled state until settings are loaded
  modeSelect.disabled = true;
  weightSlider.disabled = true;
  weightReset.disabled = true;
  weightSection.classList.add("controls-disabled");
  modeRow.classList.add("controls-disabled");

  // Load settings
  const autoForceKey = currentDomain
    ? globalThis.FontOverrideState.getAutoForceKey(currentDomain)
    : null;
  const [data, local] = await Promise.all([
    chrome.storage.sync.get({
      globalEnabled: false,
      mode: "smart",
      siteRules: {},
      siteWeights: {},
    }),
    autoForceKey ? chrome.storage.local.get({ [autoForceKey]: false }) : {},
  ]);
  globalToggle.checked = data.globalEnabled;
  globalMode = data.mode;
  modeSelect.value = globalMode;
  autoForced = autoForceKey ? local[autoForceKey] === true : false;
  const siteWeight = currentDomain ? data.siteWeights[currentDomain] : undefined;
  isWeightSiteSpecific = siteWeight !== undefined;
  const effectiveWeight = isWeightSiteSpecific ? siteWeight : 0;
  weightSlider.value = effectiveWeight;
  weightValue.textContent = formatOffset(effectiveWeight);
  updateWeightPreview(effectiveWeight);
  updateWeightSourceIndicator();
  if (currentDomain && data.siteRules[currentDomain]) {
    siteRule.value = data.siteRules[currentDomain];
  }
  updateControlsState();

  // Save on change
  globalToggle.addEventListener("change", () => {
    chrome.storage.sync.set({ globalEnabled: globalToggle.checked });
    updateControlsState();
  });

  modeSelect.addEventListener("change", () => {
    globalMode = modeSelect.value;
    chrome.storage.sync.set({ mode: globalMode });
    updateControlsState();
  });

  weightSlider.addEventListener("input", () => {
    const offset = parseInt(weightSlider.value, 10);
    weightValue.textContent = formatOffset(offset);
    updateWeightPreview(offset);
  });

  weightSlider.addEventListener("change", () => {
    if (!currentDomain) return;
    const offset = parseInt(weightSlider.value, 10);
    chrome.storage.sync.get({ siteWeights: {} }, (data) => {
      const weights = data.siteWeights;
      weights[currentDomain] = offset;
      chrome.storage.sync.set({ siteWeights: weights });
    });
    isWeightSiteSpecific = true;
    updateWeightSourceIndicator();
  });

  weightReset.addEventListener("click", () => {
    if (!currentDomain) return;
    chrome.storage.sync.get({ siteWeights: {} }, (data) => {
      const weights = data.siteWeights;
      delete weights[currentDomain];
      chrome.storage.sync.set({ siteWeights: weights });
    });
    weightSlider.value = 0;
    weightValue.textContent = "±0";
    updateWeightPreview(0);
    isWeightSiteSpecific = false;
    updateWeightSourceIndicator();
  });

  // Forget the verdict and reload so that the page is judged again
  autoRejudge.addEventListener("click", async () => {
    if (!autoForceKey || currentTabId === null) return;
    await chrome.storage.local.remove(autoForceKey);
    await chrome.tabs.reload(currentTabId);
    window.close();
  });

  siteRule.addEventListener("change", () => {
    if (!currentDomain) return;
    chrome.storage.sync.get({ siteRules: {} }, (data) => {
      const rules = data.siteRules;
      if (siteRule.value === "default") {
        delete rules[currentDomain];
      } else {
        rules[currentDomain] = siteRule.value;
      }
      chrome.storage.sync.set({ siteRules: rules });
    });
    updateControlsState();
  });
});
