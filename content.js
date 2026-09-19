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
  // Force mode: "self" / "before" / "after" whose original font must be kept
  const KEEP_ATTR = "data-fo-jp-keep";
  // Force mode: temporarily lifts the override to read the original fonts
  const PROBE_ATTR = "data-fo-jp-probe";

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

  // Auto mode gives up when too little kana appears within this window
  const DETECTION_WINDOW_MS = 10000;

  const SKIPPED_TAGS = new Set(["SCRIPT", "STYLE", "LINK"]);
  const KANA_SKIPPED_PARENTS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA"]);

  const judge = globalThis.FontOverrideJudge;
  const domain = globalThis.FontOverrideDomain.extractDomain(location.hostname);
  const autoForceKey = globalThis.FontOverrideState.getAutoForceKey(domain);
  let enabled = true;
  let mode = "smart"; // "smart" | "force" | "auto"
  let autoForced = false; // Auto mode has judged this domain as poor
  let weightOffset = 0; // -300 to +300 (relative adjustment)
  let styleEl = null;
  let mutationObserver = null;
  let mutationDebounceTimer = null;
  let isProcessing = false; // guard against re-entrant observer calls
  let domReadyHandler = null;
  let messageHandler = null;
  let detection = null; // Auto mode: { stats, ready, wait, giveUpTimer }

  // ── Settings ────────────────────────────────────────────
  async function loadSettings() {
    const [data, local] = await Promise.all([
      chrome.storage.sync.get({
        globalEnabled: false,
        mode: "smart",
        siteRules: {},
        siteWeights: {},
      }),
      chrome.storage.local.get({ [autoForceKey]: false }),
    ]);
    const state = globalThis.FontOverrideState.resolveRuleState({
      globalEnabled: data.globalEnabled,
      mode: data.mode,
      siteRule: data.siteRules[domain] || "default",
    });
    enabled = state.enabled;
    mode = state.mode;
    autoForced = local[autoForceKey] === true;
    weightOffset = data.siteWeights[domain] || 0;
  }

  // After the extension is reloaded or updated, this copy is orphaned: chrome.*
  // APIs are gone and a freshly injected copy takes over. Stop quietly without
  // touching the markers and inline styles that the new copy has adopted.
  function stopIfOrphaned() {
    if (chrome.runtime?.id) return false;
    stopAutoDetection();
    stopObserving();
    if (styleEl) {
      styleEl.remove();
      styleEl = null;
    }
    if (domReadyHandler) {
      document.removeEventListener("DOMContentLoaded", domReadyHandler);
      domReadyHandler = null;
    }
    return true;
  }

  function isForceActive() {
    return mode === "force" || (mode === "auto" && autoForced);
  }

  function needsElementScan() {
    return mode === "smart" || isForceActive() || weightOffset !== 0;
  }

  // ── Force mode: simple CSS !important ───────────────────
  function applyForceMode() {
    if (styleEl) styleEl.remove();
    const target =
      '*:not([class*="icon"]):not([class*="Icon"]):not([class*="material"]):not([class*="fa-"]):not([class*="fa "]):not([class*="glyphicon"]):not(code):not(pre):not(kbd):not(samp)' +
      `:not([${PROBE_ATTR}], [${PROBE_ATTR}] *)`;
    styleEl = document.createElement("style");
    styleEl.id = "font-override-jp";
    styleEl.textContent = `
      ${target}:not(.mono):not(.monospace):not([${KEEP_ATTR}~="self"]),
      ${target}:not([${KEEP_ATTR}~="before"])::before,
      ${target}:not([${KEEP_ATTR}~="after"])::after {
        font-family: ${DEFAULT_FONT}, ${FALLBACK} !important;
      }
    `;
    (document.head || document.documentElement).appendChild(styleEl);
  }

  function isPreservedFontFamily(fontFamily) {
    return judge.isPreservedFontStack(judge.parseFontFamilyList(fontFamily));
  }

  function readKeepTokens(el) {
    const tokens = [];
    if (isPreservedFontFamily(getComputedStyle(el).fontFamily)) {
      tokens.push("self");
    }
    for (const pseudo of ["before", "after"]) {
      const style = getComputedStyle(el, `::${pseudo}`);
      if (style.content === "none" || style.content === "normal") continue;
      // Icon fonts draw their glyphs from the Private Use Area,
      // so this also catches icon fonts with arbitrary names.
      if (
        isPreservedFontFamily(style.fontFamily) ||
        judge.hasPrivateUseChar(style.content)
      ) {
        tokens.push(pseudo);
      }
    }
    return tokens.join(" ");
  }

  // Force CSS hides the original fonts, so read them with the override
  // lifted from the subtree only (disabling the whole sheet would restyle
  // the entire document on every batch).
  function markPreservedFonts(probeRoot, elements) {
    probeRoot.setAttribute(PROBE_ATTR, "");
    let keepTokens;
    try {
      keepTokens = elements.map(readKeepTokens);
    } finally {
      probeRoot.removeAttribute(PROBE_ATTR);
    }

    elements.forEach((el, i) => {
      if (keepTokens[i]) {
        el.setAttribute(KEEP_ATTR, keepTokens[i]);
      } else {
        el.removeAttribute(KEEP_ATTR);
      }
    });
  }

  // ── Smart mode: override only target fonts ──────────────
  function shouldOverride(fontFamily) {
    if (!fontFamily) return false;
    const lower = fontFamily.toLowerCase();

    // Preserve icon / monospace fonts
    for (const pat of judge.PRESERVE_PATTERNS) {
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

  function collectElements(root, includeRoot) {
    const elements = includeRoot ? [root] : [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
    let node;
    while ((node = walker.nextNode())) {
      elements.push(node);
    }
    return elements.filter(
      (el) => el instanceof HTMLElement && !SKIPPED_TAGS.has(el.tagName)
    );
  }

  function processElements(probeRoot, elements) {
    if (isForceActive()) {
      markPreservedFonts(probeRoot, elements);
    }
    if (mode === "smart" || weightOffset !== 0) {
      elements.forEach(processElement);
    }
  }

  function processSubtree(root) {
    if (!(root instanceof HTMLElement) || !root.isConnected) return;
    processElements(root, collectElements(root, true));
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
    // Skip already-processed elements
    if (el.hasAttribute(MARKER_ATTR)) return;

    const computed = getComputedStyle(el);
    const ff = computed.fontFamily;
    // Force / Auto rely on the stylesheet; inline !important would beat KEEP_ATTR
    const fontOverridden = mode === "smart" && shouldOverride(ff);

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
      const root = document.body || document.documentElement;
      processElements(root, collectElements(root, false));
    });
  }

  // ── Auto mode: Force only when Japanese text looks poor ─
  function isDetecting() {
    return detection !== null && detection.ready;
  }

  function stylesheetsPending() {
    return Array.from(
      document.querySelectorAll('link[rel~="stylesheet"]')
    ).some((link) => !link.sheet);
  }

  function startAutoDetection() {
    detection = { stats: { poor: 0, ok: 0 }, ready: false, wait: null, giveUpTimer: null };
    waitForStyles();
  }

  // Computed fonts are meaningless until the stylesheets are applied
  function waitForStyles() {
    if (document.readyState === "loading") {
      waitForEvent(document, "DOMContentLoaded");
    } else if (document.readyState === "interactive" && stylesheetsPending()) {
      waitForEvent(window, "load");
    } else {
      detection.ready = true;
      // e.g. pages without Japanese text, or SPAs that never render enough kana
      detection.giveUpTimer = setTimeout(finishAutoDetection, DETECTION_WINDOW_MS);
      countKanaByFont([document.body || document.documentElement]);
      concludeDetection();
    }
  }

  function waitForEvent(target, type) {
    const handler = () => {
      detection.wait = null;
      if (stopIfOrphaned()) return;
      waitForStyles();
    };
    target.addEventListener(type, handler, { once: true });
    detection.wait = { target, type, handler };
  }

  function stopAutoDetection() {
    if (detection?.wait) {
      const { target, type, handler } = detection.wait;
      target.removeEventListener(type, handler);
    }
    if (detection?.giveUpTimer) {
      clearTimeout(detection.giveUpTimer);
    }
    detection = null;
  }

  // Leave the page as it is; the observer is kept only for the weight offset
  function finishAutoDetection() {
    stopAutoDetection();
    if (!needsElementScan()) stopObserving();
  }

  function countKanaByFont(roots) {
    const japaneseWebFonts = judge.collectJapaneseWebFontFamilies(document.fonts);
    const verdictCache = new Map();

    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      let node;
      while ((node = walker.nextNode())) {
        const kana = judge.countKana(node.data);
        const parent = node.parentElement;
        if (kana === 0 || !parent || KANA_SKIPPED_PARENTS.has(parent.tagName)) {
          continue;
        }

        const fontFamily = getComputedStyle(parent).fontFamily;
        let verdict = verdictCache.get(fontFamily);
        if (!verdict) {
          verdict = judge.classifyFontStack(
            judge.parseFontFamilyList(fontFamily),
            japaneseWebFonts
          );
          verdictCache.set(fontFamily, verdict);
        }
        if (verdict !== "ignore") {
          detection.stats[verdict] += kana;
        }
      }
    }
  }

  // May re-run apply(), so call it outside runWithObserverPaused
  function concludeDetection() {
    const verdict = judge.judgeKanaStats(detection.stats);
    if (verdict === "force") {
      enableAutoForce();
    } else if (verdict === "keep") {
      finishAutoDetection();
    }
  }

  function enableAutoForce() {
    autoForced = true;
    // Next visits apply Force at document_start without waiting for a verdict
    chrome.storage.local.set({ [autoForceKey]: true }).catch((error) => {
      console.error("[Font Override JP] Failed to save the Auto verdict:", error);
    });
    apply();
  }

  function observeMutations() {
    stopObserving();
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
        mutationDebounceTimer = null;
        if (stopIfOrphaned()) return;
        const roots = coalesceRoots(Array.from(pendingRoots));
        pendingRoots.clear();

        // Before the initial detection, nodes are counted by its full scan
        const detecting = isDetecting();
        runWithObserverPaused(() => {
          if (needsElementScan()) {
            for (const root of roots) {
              processSubtree(root);
            }
          }
          if (detecting) {
            countKanaByFont(roots);
          }
        });
        if (detecting) {
          concludeDetection();
        }
      }, 100);
    });

    // Only watch for new nodes, NOT attribute changes (avoids infinite loop)
    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function stopObserving() {
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    if (mutationDebounceTimer) {
      clearTimeout(mutationDebounceTimer);
      mutationDebounceTimer = null;
    }
  }

  // ── Apply / Remove ──────────────────────────────────────
  function cleanup() {
    stopAutoDetection();
    if (styleEl) {
      styleEl.remove();
      styleEl = null;
    }
    stopObserving();
    // Remove markers so re-apply works cleanly
    document.querySelectorAll(`[${MARKER_ATTR}]`).forEach((el) => {
      el.removeAttribute(MARKER_ATTR);
      el.style.removeProperty("font-family");
      el.style.removeProperty("font-weight");
    });
    document.querySelectorAll(`[${KEEP_ATTR}]`).forEach((el) => {
      el.removeAttribute(KEEP_ATTR);
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

    if (isForceActive()) {
      applyForceMode();
    }

    // Smart: font-family and weight. Force: KEEP_ATTR marks and weight.
    // Auto before a verdict: weight only, plus detection.
    const detecting = mode === "auto" && !autoForced;
    if (!needsElementScan() && !detecting) return;

    if (document.body && needsElementScan()) {
      scanAll();
    }
    observeMutations();

    // Keep this last: a "force" verdict re-runs apply() synchronously
    if (detecting) {
      startAutoDetection();
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
      if (enabled && isForceActive()) {
        applyForceMode();
      }
      if (enabled) {
        domReadyHandler = () => {
          domReadyHandler = null;
          if (stopIfOrphaned()) return;
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
