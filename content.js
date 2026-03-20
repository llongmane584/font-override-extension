(() => {
  "use strict";

  const CONTROLLER_KEY = "__fontOverrideJpController__";
  const existingController = globalThis[CONTROLLER_KEY];
  if (existingController) {
    existingController.refresh();
    return;
  }

  // ── Config ──────────────────────────────────────────────
  const DEFAULT_FONT = '"Noto Sans JP"';
  const FALLBACK = "sans-serif";
  const MARKER_ATTR = "data-fo-jp";

  // font-family values that should be overridden
  const OVERRIDE_TARGETS = [
    "system-ui",
    "-apple-system",
    "blinkmacsystemfont",
    "segoe ui",
    "yu gothic",
    "yu gothic ui",
    "meiryo",
    "ms pgothic",
    "ms gothic",
    "hiragino sans",
    "hiragino kaku gothic pro",
    "hiragino kaku gothic pron",
    "sans-serif",
    "arial",
    "helvetica",
    "helvetica neue",
  ];

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

  const hostname = location.hostname;
  let enabled = true;
  let mode = "smart"; // "smart" | "force"
  let weightOffset = 0; // -300 to +300 (relative adjustment)
  let styleEl = null;
  let mutationObserver = null;
  let mutationDebounceTimer = null;
  let isProcessing = false; // guard against re-entrant observer calls
  let domReadyHandler = null;
  let messageHandler = null;

  // ── Settings ────────────────────────────────────────────
  function loadSettings() {
    return new Promise((resolve) => {
      if (!chrome?.storage?.sync) {
        resolve();
        return;
      }
      chrome.storage.sync.get(
        { globalEnabled: false, mode: "smart", weightOffset: 0, siteRules: {} },
        (data) => {
          const rule = data.siteRules[hostname];
          if (rule === "disabled") {
            enabled = false;
          } else if (rule === "smart") {
            enabled = true;
            mode = "smart";
          } else if (rule === "force") {
            enabled = true;
            mode = "force";
          } else {
            enabled = data.globalEnabled;
            mode = data.mode || "smart";
          }
          weightOffset = data.weightOffset || 0;
          resolve();
        }
      );
    });
  }

  // ── Force mode: simple CSS !important ───────────────────
  function applyForceMode() {
    if (styleEl) styleEl.remove();
    styleEl = document.createElement("style");
    styleEl.id = "font-override-jp";
    styleEl.textContent = `
      *:not([class*="icon"]):not([class*="Icon"]):not([class*="material"]):not([class*="fa-"]):not([class*="fa "]):not([class*="glyphicon"]):not(code):not(pre):not(kbd):not(samp):not(.mono):not(.monospace),
      *:not([class*="icon"]):not([class*="Icon"]):not([class*="material"]):not([class*="fa-"]):not([class*="fa "]):not([class*="glyphicon"]):not(code):not(pre):not(kbd):not(samp)::before,
      *:not([class*="icon"]):not([class*="Icon"]):not([class*="material"]):not([class*="fa-"]):not([class*="fa "]):not([class*="glyphicon"]):not(code):not(pre):not(kbd):not(samp)::after {
        font-family: ${DEFAULT_FONT}, ${FALLBACK} !important;
      }
    `;
    (document.head || document.documentElement).appendChild(styleEl);
  }

  // ── Smart mode: override only target fonts ──────────────
  function shouldOverride(fontFamily) {
    if (!fontFamily) return false;
    const lower = fontFamily.toLowerCase();

    // Preserve icon / monospace fonts
    for (const pat of PRESERVE_PATTERNS) {
      if (pat.test(lower)) return false;
    }

    // Check if any segment matches override targets
    const segments = lower.split(",").map((s) => s.trim().replace(/["']/g, ""));
    return segments.some((seg) =>
      OVERRIDE_TARGETS.some((t) => seg === t || seg.startsWith(t))
    );
  }

  function buildOverrideValue(original) {
    const cleaned = original.replace(/!important/gi, "").trim();
    return `${DEFAULT_FONT}, ${cleaned}`;
  }

  function clampWeight(w) {
    return Math.max(1, Math.min(1000, w));
  }

  function processSubtree(root) {
    if (!(root instanceof HTMLElement) || !root.isConnected) return;

    processElement(root);

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
    let node;
    while ((node = walker.nextNode())) {
      processElement(node);
    }
  }

  function coalesceRoots(elements) {
    const roots = [];

    for (const el of elements) {
      if (!(el instanceof HTMLElement) || !el.isConnected) continue;
      if (roots.some((root) => root.contains(el))) continue;

      for (let i = roots.length - 1; i >= 0; i -= 1) {
        if (el.contains(roots[i])) {
          roots.splice(i, 1);
        }
      }

      roots.push(el);
    }

    return roots;
  }

  function processElement(el) {
    if (!(el instanceof HTMLElement)) return;
    if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "LINK") return;

    // Skip already-processed elements
    if (el.hasAttribute(MARKER_ATTR)) return;

    const computed = getComputedStyle(el);
    const ff = computed.fontFamily;
    const fontOverridden = shouldOverride(ff);

    // Skip if neither font nor weight needs changing
    if (!fontOverridden && weightOffset === 0) return;

    el.setAttribute(MARKER_ATTR, "1");

    if (fontOverridden) {
      el.style.setProperty("font-family", buildOverrideValue(ff), "important");
    }

    if (weightOffset !== 0) {
      const currentWeight = parseInt(computed.fontWeight, 10) || 400;
      const newWeight = clampWeight(currentWeight + weightOffset);
      el.style.setProperty("font-weight", String(newWeight), "important");
    }
  }

  // Run a batch of DOM modifications with the observer paused
  function runWithObserverPaused(fn) {
    if (isProcessing) return;
    isProcessing = true;
    if (mutationObserver) mutationObserver.disconnect();

    try {
      fn();
    } finally {
      if (mutationObserver) {
        mutationObserver.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
      }
      isProcessing = false;
    }
  }

  function scanAll() {
    runWithObserverPaused(() => {
      const walker = document.createTreeWalker(
        document.body || document.documentElement,
        NodeFilter.SHOW_ELEMENT,
        null
      );
      let node;
      while ((node = walker.nextNode())) {
        processElement(node);
      }
    });
  }

  function observeMutations() {
    if (mutationObserver) mutationObserver.disconnect();
    if (mutationDebounceTimer) {
      clearTimeout(mutationDebounceTimer);
      mutationDebounceTimer = null;
    }
    const pendingRoots = new Set();

    mutationObserver = new MutationObserver((mutations) => {
      if (isProcessing) return;

      for (const m of mutations) {
        if (m.type === "childList") {
          for (const added of m.addedNodes) {
            if (added instanceof HTMLElement) {
              pendingRoots.add(added);
            }
          }
        }
      }

      if (pendingRoots.size === 0) return;

      // Debounce: batch-process after a short pause
      clearTimeout(mutationDebounceTimer);
      mutationDebounceTimer = setTimeout(() => {
        const roots = coalesceRoots(Array.from(pendingRoots));
        pendingRoots.clear();

        runWithObserverPaused(() => {
          for (const root of roots) {
            processSubtree(root);
          }
        });
        mutationDebounceTimer = null;
      }, 100);
    });

    // Only watch for new nodes, NOT attribute changes (avoids infinite loop)
    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  // ── Apply / Remove ──────────────────────────────────────
  function cleanup() {
    if (styleEl) {
      styleEl.remove();
      styleEl = null;
    }
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    if (mutationDebounceTimer) {
      clearTimeout(mutationDebounceTimer);
      mutationDebounceTimer = null;
    }
    // Remove markers so re-apply works cleanly
    document.querySelectorAll(`[${MARKER_ATTR}]`).forEach((el) => {
      el.removeAttribute(MARKER_ATTR);
      el.style.removeProperty("font-family");
      el.style.removeProperty("font-weight");
    });
  }

  function teardown() {
    cleanup();

    if (domReadyHandler) {
      document.removeEventListener("DOMContentLoaded", domReadyHandler);
      domReadyHandler = null;
    }

    if (messageHandler && chrome?.runtime?.onMessage) {
      chrome.runtime.onMessage.removeListener(messageHandler);
      messageHandler = null;
    }

    delete globalThis[CONTROLLER_KEY];
  }

  function apply() {
    cleanup();
    if (!enabled) return;

    if (mode === "force") {
      applyForceMode();
    }

    // In smart mode: scan handles both font-family and weight
    // In force mode: font-family is CSS-based, but weight offset still needs per-element scan
    if (mode === "smart" || weightOffset !== 0) {
      if (document.body) {
        scanAll();
      }
      observeMutations();
    }
  }

  // ── Init ────────────────────────────────────────────────
  function registerMessageListener() {
    if (!chrome?.runtime?.onMessage) return;

    messageHandler = (message) => {
      if (!message || typeof message.type !== "string") {
        return;
      }

      if (message.type === "font-override-jp:apply") {
        loadSettings().then(apply);
      } else if (message.type === "font-override-jp:teardown") {
        teardown();
      }
    };

    chrome.runtime.onMessage.addListener(messageHandler);
  }

  async function init() {
    registerMessageListener();
    await loadSettings();

    if (document.readyState === "loading") {
      if (enabled && mode === "force") {
        applyForceMode();
      }
      if (enabled) {
        domReadyHandler = () => {
          domReadyHandler = null;
          apply();
        };
        document.addEventListener("DOMContentLoaded", domReadyHandler);
      }
    } else {
      apply();
    }
  }

  globalThis[CONTROLLER_KEY] = {
    refresh() {
      loadSettings().then(apply);
    },
  };

  init();
})();
