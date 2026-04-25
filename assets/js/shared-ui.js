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

function applyTwinkleState(enabled, buttonNode) {
  document.body.classList.toggle("sky-twinkle-on", enabled);
  if (buttonNode) {
    buttonNode.textContent = enabled ? "Twinkle: On" : "Twinkle: Off";
    buttonNode.setAttribute("aria-pressed", enabled ? "true" : "false");
  }
}

function renderSkyToggle() {
  if (document.querySelector("[data-sky-toggle]")) {
    return;
  }

  const button = document.createElement("button");
  button.className = "sky-toggle";
  button.type = "button";
  button.setAttribute("data-sky-toggle", "true");
  button.setAttribute("aria-label", "Toggle star twinkle mode");

  const saved = window.localStorage.getItem("skyTwinkleEnabled");
  const initialState = saved === "1";
  applyTwinkleState(initialState, button);

  button.addEventListener("click", () => {
    const nextState = !document.body.classList.contains("sky-twinkle-on");
    applyTwinkleState(nextState, button);
    window.localStorage.setItem("skyTwinkleEnabled", nextState ? "1" : "0");
  });

  document.body.appendChild(button);
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

function renderSharedUi() {
  renderSharedFooter();
  renderSkyToggle();
  renderShootingStars();
}

document.addEventListener("DOMContentLoaded", renderSharedUi);
