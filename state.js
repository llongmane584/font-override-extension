(function initializeFontOverrideState(root) {
  const MODE_LABELS = {
    smart: "Smart",
    force: "Force",
    auto: "Auto",
  };

  const SITE_RULE_MODES = ["smart", "force", "auto"];

  function getModeLabel(mode) {
    const label = MODE_LABELS[mode];
    if (!label) {
      throw new Error(`Unknown mode: ${mode}`);
    }
    return label;
  }

  function getAutoForceKey(domain) {
    return `autoForce:${domain}`;
  }

  function resolveRuleState({ globalEnabled, mode, siteRule }) {
    if (SITE_RULE_MODES.includes(siteRule)) {
      return { enabled: true, mode: siteRule, reason: `site-${siteRule}` };
    }

    if (siteRule === "disabled") {
      return { enabled: false, mode, reason: "site-disabled" };
    }

    return {
      enabled: Boolean(globalEnabled),
      mode,
      reason: globalEnabled ? "global-enabled" : "global-disabled",
    };
  }

  function getStateDetail(state) {
    if (state.reason.startsWith("site-") && state.enabled) {
      return `このサイトでは ${getModeLabel(state.mode)} ルールで有効`;
    }

    if (state.reason === "site-disabled") {
      return "このサイトでは無効ルールを優先";
    }

    if (state.reason === "global-enabled") {
      return `グローバル既定に従い ${getModeLabel(state.mode)} で有効`;
    }

    return "グローバル既定が OFF のため無効";
  }

  function getAutoStatus(state, autoForced) {
    if (!state.enabled || state.mode !== "auto") {
      return null;
    }
    return autoForced ? "forced" : "pending";
  }

  function buildPopupState({ globalEnabled, mode, siteRule, autoForced = false }) {
    const effective = resolveRuleState({ globalEnabled, mode, siteRule });
    const isDefaultRule = siteRule === "default";

    return {
      ...effective,
      label: effective.enabled ? "ON" : "OFF",
      detail: getStateDetail(effective),
      autoStatus: getAutoStatus(effective, autoForced),
      modeLocked: !isDefaultRule || !globalEnabled,
      weightDisabled: !effective.enabled,
    };
  }

  function resolveTabStateForHost(hostname, settings) {
    return resolveRuleState({
      globalEnabled: settings.globalEnabled,
      mode: settings.mode,
      siteRule: settings.siteRules[hostname] || "default",
    });
  }

  const api = {
    buildPopupState,
    getAutoForceKey,
    getModeLabel,
    resolveRuleState,
    resolveTabStateForHost,
  };

  root.FontOverrideState = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
