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
  const weightSection = weightSlider.closest(".section");
  const modeRow = modeSelect.closest(".row");
  let globalMode = "smart";

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function formatOffset(v) {
    if (v === 0) return "±0";
    return v > 0 ? `+${v}` : String(v);
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
    });
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

    modeRow.classList.toggle("controls-disabled", state.modeLocked);
    weightSection.classList.toggle("controls-disabled", weightDisabled);
  }

  // Get current tab domain
  let currentDomain = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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
  chrome.storage.sync.get(
    { globalEnabled: false, mode: "smart", weightOffset: 0, siteRules: {} },
    (data) => {
      globalToggle.checked = data.globalEnabled;
      globalMode = data.mode;
      modeSelect.value = globalMode;
      weightSlider.value = data.weightOffset || 0;
      weightValue.textContent = formatOffset(data.weightOffset || 0);
      updateWeightPreview(data.weightOffset || 0);
      if (currentDomain && data.siteRules[currentDomain]) {
        siteRule.value = data.siteRules[currentDomain];
      }
      updateControlsState();
    }
  );

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
    const offset = parseInt(weightSlider.value, 10);
    chrome.storage.sync.set({ weightOffset: offset });
  });

  weightReset.addEventListener("click", () => {
    weightSlider.value = 0;
    weightValue.textContent = "±0";
    updateWeightPreview(0);
    chrome.storage.sync.set({ weightOffset: 0 });
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
