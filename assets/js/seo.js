(() => {
  const DEFAULT_SITE_URL = "https://krishnapranay.com";
  const DEFAULT_IMAGE_PATH = "/assets/images/favicon-astronaut.png";

  function normalizeSiteUrl(value) {
    return String(value || DEFAULT_SITE_URL).replace(/\/+$/, "");
  }

  function siteUrl() {
    if (window.BLOG_CONFIG && window.BLOG_CONFIG.siteUrl) {
      return normalizeSiteUrl(window.BLOG_CONFIG.siteUrl);
    }
    return normalizeSiteUrl(DEFAULT_SITE_URL);
  }

  function absoluteUrl(pathOrUrl) {
    const value = String(pathOrUrl || "").trim();
    if (!value) {
      return siteUrl();
    }
    if (/^https?:\/\//i.test(value)) {
      return value;
    }
    const path = value.startsWith("/") ? value : `/${value.replace(/^\.?\//, "")}`;
    return `${siteUrl()}${path}`;
  }

  function upsertMeta(key, value, attr = "name") {
    if (!key || value === undefined || value === null || value === "") {
      return;
    }
    let node = document.head.querySelector(`meta[${attr}="${key}"]`);
    if (!node) {
      node = document.createElement("meta");
      node.setAttribute(attr, key);
      document.head.appendChild(node);
    }
    node.setAttribute("content", String(value));
  }

  function setCanonical(url) {
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", absoluteUrl(url));
  }

  function setStructuredData(id, data) {
    if (!id) {
      return;
    }
    const scriptId = `ld-json-${id}`;
    let node = document.getElementById(scriptId);
    if (!node) {
      node = document.createElement("script");
      node.type = "application/ld+json";
      node.id = scriptId;
      document.head.appendChild(node);
    }
    node.textContent = JSON.stringify(data);
  }

  function setSeo(meta) {
    const next = meta || {};
    const title = next.title || "Krishna Pranay";
    const description = next.description || "Travel, thoughts, and money insights.";
    const pagePath = next.path || window.location.pathname + window.location.search;
    const image = next.image ? absoluteUrl(next.image) : absoluteUrl(DEFAULT_IMAGE_PATH);
    const type = next.type || "website";
    const pageUrl = absoluteUrl(pagePath);

    document.title = title;
    upsertMeta("description", description, "name");
    upsertMeta("robots", "index,follow,max-image-preview:large", "name");
    upsertMeta("og:title", title, "property");
    upsertMeta("og:description", description, "property");
    upsertMeta("og:type", type, "property");
    upsertMeta("og:url", pageUrl, "property");
    upsertMeta("og:image", image, "property");
    upsertMeta("og:site_name", "Krishna Pranay", "property");
    upsertMeta("twitter:card", "summary_large_image", "name");
    upsertMeta("twitter:title", title, "name");
    upsertMeta("twitter:description", description, "name");
    upsertMeta("twitter:image", image, "name");
    setCanonical(pagePath);
  }

  window.SEO_UTILS = {
    absoluteUrl,
    setSeo,
    setStructuredData
  };
})();
