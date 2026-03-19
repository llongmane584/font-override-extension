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

  // Get current tab hostname
  let currentHostname = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      const url = new URL(tab.url);
      currentHostname = url.hostname;
      hostnameEl.textContent = currentHostname;
    }
  } catch {
    hostnameEl.textContent = "(不明)";
  }

  // Load settings
  chrome.storage.sync.get(
    { globalEnabled: true, mode: "smart", weightOffset: 0, siteRules: {} },
    (data) => {
      globalToggle.checked = data.globalEnabled;
      modeSelect.value = data.mode;
      weightSlider.value = data.weightOffset || 0;
      weightValue.textContent = formatOffset(data.weightOffset || 0);
      updateWeightPreview(data.weightOffset || 0);
      if (currentHostname && data.siteRules[currentHostname]) {
        siteRule.value = data.siteRules[currentHostname];
      }
    }
  );

  // Save on change
  globalToggle.addEventListener("change", () => {
    chrome.storage.sync.set({ globalEnabled: globalToggle.checked });
  });

  modeSelect.addEventListener("change", () => {
    chrome.storage.sync.set({ mode: modeSelect.value });
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
    if (!currentHostname) return;
    chrome.storage.sync.get({ siteRules: {} }, (data) => {
      const rules = data.siteRules;
      if (siteRule.value === "default") {
        delete rules[currentHostname];
      } else {
        rules[currentHostname] = siteRule.value;
      }
      chrome.storage.sync.set({ siteRules: rules });
    });
  });
});
