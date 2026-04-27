const {
  escapeHtml,
  toValidPosts,
  getGroupAnchorId,
  getSubgroupAnchorId,
  getGroupPostsAnchorId,
  getPostAnchorId,
  getPostUrl,
  buildSectionCtaStyle
} = window.SECTION_UTILS || {};

function createPostCard(sectionMeta, post, cardId) {
  const postUrl = getPostUrl(post.slug, sectionMeta.key, "../");
  const cardClass = sectionMeta.key === "travel"
    ? "card post-card post-card--travel post-card--clickable"
    : "card post-card post-card--clickable";
  const ctaLabel = escapeHtml(post.ctaLabel || "Read post");
  const overlayLabel = escapeHtml(`Open ${post.title || "post"}`);
  const imageNode = post.image
    ? `<img class="post-image" src="../${post.image}" alt="${post.imageAlt || post.title}" loading="lazy" />`
    : "";
  const ctaStyle = buildSectionCtaStyle(sectionMeta, "../");
  const articleId = cardId ? ` id="${cardId}"` : "";
  return `
    <article class="${cardClass}"${articleId}>
      <a class="card-link-overlay" href="${postUrl}" aria-label="${overlayLabel}"></a>
      ${imageNode}
      <p class="eyebrow">${post.date}</p>
      <h3>${post.title}</h3>
      <p>${post.summary}</p>
      <a class="button section-cta" ${ctaStyle} href="${postUrl}">${ctaLabel}</a>
    </article>
  `;
}

function renderPostGrid(sectionMeta, posts, scopeId) {
  const validPosts = toValidPosts(posts);
  if (!validPosts.length) {
    return '<p class="empty-state">No posts yet in this section.</p>';
  }
  return `
    <div class="section-grid">
      ${validPosts
        .map((post, postIndex) => createPostCard(sectionMeta, post, scopeId ? getPostAnchorId(scopeId, post, postIndex) : ""))
        .join("")}
    </div>
  `;
}

function renderGroupedPosts(sectionMeta, groups) {
  const validGroups = Array.isArray(groups) ? groups : [];
  if (!validGroups.length) {
    return "";
  }

  const groupsHtml = validGroups
    .map((group, groupIndex) => {
      const groupId = getGroupAnchorId(group, groupIndex);
      const groupTitle = escapeHtml(group.title || "Untitled group");
      const groupDescription = group.description
        ? `<p class="tagline group-description">${escapeHtml(group.description)}</p>`
        : "";
      const groupPostsId = getGroupPostsAnchorId(group, groupIndex);
      const groupPostsHtml = renderPostGrid(sectionMeta, group.posts, groupPostsId);
      const hasGroupPosts = toValidPosts(group.posts).length > 0;
      const groupPostsSectionTitle = escapeHtml(group.postsTitle || `More in ${groupTitle}`);

      const subgroupHtml = Array.isArray(group.subgroups) && group.subgroups.length
        ? group.subgroups
          .map((subgroup, subgroupIndex) => {
            const subgroupId = getSubgroupAnchorId(group, subgroup, groupIndex, subgroupIndex);
            const subgroupTitle = escapeHtml(subgroup.title || "Untitled subgroup");
            const subgroupDescription = subgroup.description
              ? `<p class="tagline subgroup-description">${escapeHtml(subgroup.description)}</p>`
              : "";
            const subgroupPostsHtml = renderPostGrid(sectionMeta, subgroup.posts, subgroupId);
            return `
              <section class="post-subgroup" id="${subgroupId}">
                <h4>${subgroupTitle}</h4>
                ${subgroupDescription}
                ${subgroupPostsHtml}
              </section>
            `;
          })
          .join("")
        : "";

      return `
        <section class="post-group" id="${groupId}">
          <h3>${groupTitle}</h3>
          ${groupDescription}
          ${subgroupHtml}
          ${hasGroupPosts
            ? `
              <section class="post-group-main" id="${groupPostsId}">
                <h4>${groupPostsSectionTitle}</h4>
                ${groupPostsHtml}
              </section>
            `
            : ""}
        </section>
      `;
    })
    .join("");

  return `<div class="grouped-posts">${groupsHtml}</div>`;
}

function getStructuredPostCount(data) {
  const groupedCount = Array.isArray(data.groups)
    ? data.groups.reduce((acc, group) => {
      const subgroupCount = Array.isArray(group.subgroups)
        ? group.subgroups.reduce((subAcc, subgroup) => subAcc + toValidPosts(subgroup.posts).length, 0)
        : 0;
      return acc + toValidPosts(group.posts).length + subgroupCount;
    }, 0)
    : 0;
  return groupedCount || toValidPosts(data.posts).length;
}

async function renderSection() {
  if (!window.SECTION_UTILS) {
    return;
  }
  const pageNode = document.body;
  const sectionKey = pageNode.dataset.section;
  const config = window.BLOG_CONFIG;
  const seo = window.SEO_UTILS;

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
  if (seo) {
    seo.setSeo({
      title: `${sectionMeta.title} | ${config.siteTitle || "Krishna Pranay"}`,
      description: sectionMeta.description || config.siteTagline || "",
      path: `/sections/${sectionKey}.html`,
      type: "website",
      image: "/assets/images/favicon-astronaut.png"
    });
  }

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

    if (seo) {
      seo.setStructuredData(`section-${sectionKey}`, {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: sectionMeta.title,
        description: sectionMeta.description || "",
        url: seo.absoluteUrl(`/sections/${sectionKey}.html`),
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: getStructuredPostCount(data)
        }
      });
    }

    const groupedHtml = renderGroupedPosts(sectionMeta, data.groups);
    if (groupedHtml) {
      listNode.innerHTML = groupedHtml;
      return;
    }

    const posts = toValidPosts(data.posts);
    listNode.innerHTML = posts.length
      ? posts.map((post) => createPostCard(sectionMeta, post)).join("")
      : '<p class="empty-state">No posts yet. Add one in content/sections.</p>';
  } catch (error) {
    listNode.innerHTML = '<p class="empty-state">Unable to load posts.</p>';
  }
}

document.addEventListener("DOMContentLoaded", renderSection);
