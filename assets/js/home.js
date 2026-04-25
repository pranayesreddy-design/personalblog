function createSectionCard(section) {
  const ctaLabel = section.ctaLabel || `Open ${section.title}`;
  const ctaStyle = section.ctaBackground
    ? `style="background-image: linear-gradient(120deg, rgba(0, 0, 0, 0.42), rgba(0, 0, 0, 0.18)), url('${section.ctaBackground}');"`
    : "";
  return `
    <article class="card">
      <h3>${section.title}</h3>
      <p>${section.description}</p>
      <a class="button section-cta" ${ctaStyle} href="${section.page}">${ctaLabel}</a>
    </article>
  `;
}

function createExperimentCard(experiment) {
  const ctaLabel = experiment.ctaLabel || "Read story";
  const ctaStyle = experiment.ctaBackground
    ? `style="background-image: linear-gradient(120deg, rgba(0, 0, 0, 0.42), rgba(0, 0, 0, 0.18)), url('${experiment.ctaBackground}');"`
    : "";
  return `
    <article class="card venture-card">
      <p class="eyebrow venture-status">${experiment.status}</p>
      <h3>${experiment.name}</h3>
      <p>${experiment.description}</p>
      <a class="button section-cta venture-cta" ${ctaStyle} href="${experiment.link}">${ctaLabel}</a>
    </article>
  `;
}

function renderHome() {
  const config = window.BLOG_CONFIG;
  const titleNode = document.querySelector("[data-site-title]");
  const taglineNode = document.querySelector("[data-site-tagline]");
  const sublineNode = document.querySelector("[data-site-subline]");
  const gridNode = document.querySelector("[data-section-grid]");
  const experimentGridNode =
    document.querySelector("[data-experiment-grid]") ||
    document.querySelector("[data-venture-grid]");

  if (!config || !titleNode || !taglineNode || !gridNode) {
    return;
  }

  titleNode.textContent = config.siteTitle;
  taglineNode.textContent = config.siteTagline;
  if (sublineNode) {
    if (config.siteSubline) {
      sublineNode.textContent = config.siteSubline;
      sublineNode.hidden = false;
    } else {
      sublineNode.textContent = "";
      sublineNode.hidden = true;
    }
  }
  gridNode.innerHTML = config.sections.map(createSectionCard).join("");
  if (experimentGridNode) {
    const experiments = Array.isArray(config.experiments)
      ? config.experiments
      : Array.isArray(config.ventures)
        ? config.ventures
        : [];
    experimentGridNode.innerHTML = experiments.map(createExperimentCard).join("");
  }
}

document.addEventListener("DOMContentLoaded", renderHome);
