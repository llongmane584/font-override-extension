(function initializeDomainUtils(root) {
  function extractDomain(hostname) {
    if (!hostname) return "";
    const domain = tldts.getDomain(hostname);
    return domain || hostname;
  }

  const api = { extractDomain };

  root.FontOverrideDomain = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
