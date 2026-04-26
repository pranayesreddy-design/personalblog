function createPostCard(sectionMeta, post) {
  const postUrl = `../post.html?section=${encodeURIComponent(sectionMeta.key)}&slug=${encodeURIComponent(post.slug)}`;
  const cardClass = sectionMeta.key === "travel" ? "card post-card post-card--travel" : "card post-card";
  const imageNode = post.image
    ? `<img class="post-image" src="../${post.image}" alt="${post.imageAlt || post.title}" loading="lazy" />`
    : "";
  const ctaStyle = sectionMeta.ctaBackground
    ? `style="background-image: linear-gradient(120deg, rgba(0, 0, 0, 0.42), rgba(0, 0, 0, 0.18)), url('../${sectionMeta.ctaBackground}');"`
    : "";
  return `
    <article class="${cardClass}">
      ${imageNode}
      <p class="eyebrow">${post.date}</p>
      <h3>${post.title}</h3>
      <p>${post.summary}</p>
      <a class="button section-cta" ${ctaStyle} href="${postUrl}">Read post</a>
    </article>
  `;
}

async function renderSection() {
  const pageNode = document.body;
  const sectionKey = pageNode.dataset.section;
  const config = window.BLOG_CONFIG;

  if (!sectionKey || !config) {
    return;
  }

  const sectionMeta = config.sections.find((section) => section.key === sectionKey);
  const titleNode = document.querySelector("[data-section-title]");
  const descriptionNode = document.querySelector("[data-section-description]");
  const sublineNode = document.querySelector("[data-section-subline]");
  const listNode = document.querySelector("[data-post-list]");

  if (!sectionMeta || !titleNode || !descriptionNode || !listNode) {
    return;
  }

  titleNode.textContent = sectionMeta.title;
  descriptionNode.textContent = sectionMeta.description;
  if (sublineNode) {
    if (sectionMeta.subline) {
      sublineNode.textContent = sectionMeta.subline;
      sublineNode.hidden = false;
    } else {
      sublineNode.hidden = true;
      sublineNode.textContent = "";
    }
  }

  try {
    const version = encodeURIComponent(config.contentVersion || "1");
    const response = await fetch(`../content/sections/${sectionKey}.json?v=${version}`);
    const data = await response.json();
    const posts = Array.isArray(data.posts) ? data.posts.filter((post) => post.slug) : [];

    listNode.innerHTML = posts.length
      ? posts.map((post) => createPostCard(sectionMeta, post)).join("")
      : '<p class="empty-state">No posts yet. Add one in content/sections.</p>';
  } catch (error) {
    listNode.innerHTML = '<p class="empty-state">Unable to load posts.</p>';
  }
}

document.addEventListener("DOMContentLoaded", renderSection);
