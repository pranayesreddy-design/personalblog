function renderSharedFooter() {
  const footerNodes = document.querySelectorAll("[data-shared-footer]");
  if (!footerNodes.length) {
    return;
  }

  const footerText = (window.BLOG_CONFIG && window.BLOG_CONFIG.footerText)
    ? window.BLOG_CONFIG.footerText
    : "";

  footerNodes.forEach((footerNode) => {
    footerNode.innerHTML = `
      <div class="container">
        <p>${footerText}</p>
      </div>
    `;
  });
}

function initializeAnalytics() {
  const analyticsId = window.BLOG_CONFIG && window.BLOG_CONFIG.analyticsId;
  if (!analyticsId || document.querySelector("[data-ga-loader]")) {
    return;
  }

  const gaScript = document.createElement("script");
  gaScript.async = true;
  gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(analyticsId)}`;
  gaScript.setAttribute("data-ga-loader", "true");
  document.head.appendChild(gaScript);

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag("js", new Date());
  window.gtag("config", analyticsId);
}

function enableSkyEffects() {
  document.body.classList.add("sky-twinkle-on");
}

function renderShootingStars() {
  if (document.querySelector("[data-shooting-stars]")) {
    return;
  }

  const layer = document.createElement("div");
  layer.className = "shooting-stars";
  layer.setAttribute("data-shooting-stars", "true");
  layer.innerHTML = `
    <span class="shooting-star shooting-star--1"></span>
    <span class="shooting-star shooting-star--2"></span>
    <span class="shooting-star shooting-star--3"></span>
    <span class="shooting-star shooting-star--4"></span>
  `;

  document.body.appendChild(layer);
}

function enforceScrollToTop() {
  if ("scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }

  const scrollToTop = () => window.scrollTo({ top: 0, left: 0, behavior: "auto" });

  // Run immediately and again on next frame to override browser restore.
  scrollToTop();
  window.requestAnimationFrame(scrollToTop);
}

function renderSharedUi() {
  initializeAnalytics();
  enforceScrollToTop();
  enableSkyEffects();
  renderSharedFooter();
  renderShootingStars();
}

document.addEventListener("DOMContentLoaded", renderSharedUi);
