(function initializeDomainUtils(root) {
  function extractDomain(hostname) {
    if (!hostname) return "";
    const domain = tldts.getDomain(hostname);
    return domain || hostname;
  }

  function isIPOrSingleLabel(host) {
    if (!host) return false;
    const parsed = tldts.parse(host);
    if (parsed.isIp) return true;
    return !host.includes(".");
  }

  const api = { extractDomain, isIPOrSingleLabel };

  root.FontOverrideDomain = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
