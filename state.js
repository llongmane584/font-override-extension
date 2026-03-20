(function initializeFontOverrideState(root) {
  function resolveRuleState({ globalEnabled, mode, siteRule }) {
    if (siteRule === "smart") {
      return { enabled: true, mode: "smart", reason: "site-smart" };
    }

    if (siteRule === "force") {
      return { enabled: true, mode: "force", reason: "site-force" };
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
    if (state.reason === "site-smart") {
      return "このサイトでは Smart ルールで有効";
    }

    if (state.reason === "site-force") {
      return "このサイトでは Force ルールで有効";
    }

    if (state.reason === "site-disabled") {
      return "このサイトでは無効ルールを優先";
    }

    if (state.reason === "global-enabled") {
      return `グローバル既定に従い ${
        state.mode === "force" ? "Force" : "Smart"
      } で有効`;
    }

    return "グローバル既定が OFF のため無効";
  }

  function buildPopupState({ globalEnabled, mode, siteRule }) {
    const effective = resolveRuleState({ globalEnabled, mode, siteRule });
    const isDefaultRule = siteRule === "default";

    return {
      ...effective,
      label: effective.enabled ? "ON" : "OFF",
      detail: getStateDetail(effective),
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
    resolveRuleState,
    resolveTabStateForHost,
  };

  root.FontOverrideState = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
