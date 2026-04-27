function createPostCard(sectionMeta, post, cardId) {
  const postUrl = `../post.html?section=${encodeURIComponent(sectionMeta.key)}&slug=${encodeURIComponent(post.slug)}`;
  const cardClass = sectionMeta.key === "travel"
    ? "card post-card post-card--travel post-card--clickable"
    : "card post-card post-card--clickable";
  const ctaLabel = escapeHtml(post.ctaLabel || "Read post");
  const overlayLabel = escapeHtml(`Open ${post.title || "post"}`);
  const imageNode = post.image
    ? `<img class="post-image" src="../${post.image}" alt="${post.imageAlt || post.title}" loading="lazy" />`
    : "";
  const ctaStyle = sectionMeta.ctaBackground
    ? `style="background-image: linear-gradient(120deg, rgba(0, 0, 0, 0.42), rgba(0, 0, 0, 0.18)), url('../${sectionMeta.ctaBackground}');"`
    : "";
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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toValidPosts(posts) {
  return Array.isArray(posts) ? posts.filter((post) => post && post.slug) : [];
}

function toAnchorSlug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getGroupAnchorId(group, groupIndex) {
  return `group-${toAnchorSlug(group.title || "group")}-${groupIndex + 1}`;
}

function getSubgroupAnchorId(group, subgroup, groupIndex, subgroupIndex) {
  const groupSlug = toAnchorSlug(group.title || `group-${groupIndex + 1}`);
  const subgroupSlug = toAnchorSlug(subgroup.title || "subgroup");
  return `subgroup-${groupSlug}-${subgroupSlug}-${subgroupIndex + 1}`;
}

function getGroupPostsAnchorId(group, groupIndex) {
  const groupSlug = toAnchorSlug(group.title || "group");
  return `group-main-${groupSlug}-${groupIndex + 1}`;
}

function getPostAnchorId(scopeId, post, postIndex) {
  const postSlug = toAnchorSlug(post && (post.slug || post.title || `post-${postIndex + 1}`));
  return `${scopeId}-post-${postSlug}-${postIndex + 1}`;
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

function renderGroupedIndex(groups) {
  const validGroups = Array.isArray(groups) ? groups : [];
  if (!validGroups.length) {
    return "";
  }

  function renderPostIndexItems(posts, scopeId) {
    return toValidPosts(posts)
      .filter((post) => !post.indexHidden)
      .map((post, postIndex) => {
        const postTitle = escapeHtml(post.title || post.slug || "Untitled post");
        const postId = getPostAnchorId(scopeId, post, postIndex);
        const childItems = Array.isArray(post.indexChildren) ? post.indexChildren : [];
        const childHtml = childItems.length
          ? `<ul>${
            childItems
              .map((child) => {
                const childTitle = escapeHtml(child.title || child.slug || "Untitled child");
                const childSlug = child.slug || "";
                const childHref = childSlug
                  ? `../post.html?section=travel&slug=${encodeURIComponent(childSlug)}`
                  : "#";
                return `<li><a href="${childHref}">${childTitle}</a></li>`;
              })
              .join("")
          }</ul>`
          : "";
        return `<li><a href="#${postId}">${postTitle}</a>${childHtml}</li>`;
      })
      .join("");
  }

  const itemsHtml = validGroups
    .map((group, groupIndex) => {
      const groupId = getGroupAnchorId(group, groupIndex);
      const groupTitle = escapeHtml(group.title || "Untitled group");

      const subgroupItems = Array.isArray(group.subgroups) ? group.subgroups : [];
      const subgroupHtml = subgroupItems
        .map((subgroup, subgroupIndex) => {
          const subgroupId = getSubgroupAnchorId(group, subgroup, groupIndex, subgroupIndex);
          const subgroupTitle = escapeHtml(subgroup.title || "Untitled subgroup");
          const subgroupPostItems = renderPostIndexItems(subgroup.posts, subgroupId);
          return `
            <li>
              <a href="#${subgroupId}">${subgroupTitle}</a>
              ${subgroupPostItems ? `<ul>${subgroupPostItems}</ul>` : ""}
            </li>
          `;
        })
        .join("");

      const hasGroupPosts = toValidPosts(group.posts).length > 0;
      const groupPostsTitle = escapeHtml(group.postsTitle || `More in ${group.title || "this region"}`);
      const groupPostsId = getGroupPostsAnchorId(group, groupIndex);
      const groupPostItems = renderPostIndexItems(group.posts, groupPostsId);
      const groupPostsHtml = hasGroupPosts
        ? `
          <li>
            <a href="#${groupPostsId}">${groupPostsTitle}</a>
            ${groupPostItems ? `<ul>${groupPostItems}</ul>` : ""}
          </li>
        `
        : "";

      return `
        <li>
          <a href="#${groupId}">${groupTitle}</a>
          ${(subgroupHtml || groupPostsHtml) ? `<ul>${subgroupHtml}${groupPostsHtml}</ul>` : ""}
        </li>
      `;
    })
    .join("");

  return `<ol class="section-index-list">${itemsHtml}</ol>`;
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

async function renderSection() {
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
  const indexNode = document.querySelector("[data-section-index]");
  const indexToggleNode = document.querySelector("[data-section-index-toggle]");
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
      const groupedCount = Array.isArray(data.groups)
        ? data.groups.reduce((acc, group) => {
          const subgroupCount = Array.isArray(group.subgroups)
            ? group.subgroups.reduce((subAcc, subgroup) => subAcc + toValidPosts(subgroup.posts).length, 0)
            : 0;
          return acc + toValidPosts(group.posts).length + subgroupCount;
        }, 0)
        : 0;
      const postCount = groupedCount || toValidPosts(data.posts).length;
      seo.setStructuredData(`section-${sectionKey}`, {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: sectionMeta.title,
        description: sectionMeta.description || "",
        url: seo.absoluteUrl(`/sections/${sectionKey}.html`),
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: postCount
        }
      });
    }
    const groupedHtml = renderGroupedPosts(sectionMeta, data.groups);
    if (groupedHtml) {
      if (indexNode) {
        const groupedIndexHtml = renderGroupedIndex(data.groups);
        if (groupedIndexHtml) {
          indexNode.innerHTML = groupedIndexHtml;
          indexNode.hidden = true;
          if (indexToggleNode) {
            indexToggleNode.hidden = false;
            indexToggleNode.setAttribute("aria-expanded", "false");
            indexToggleNode.onclick = () => {
              const nextHidden = !indexNode.hidden;
              indexNode.hidden = nextHidden;
              indexToggleNode.setAttribute("aria-expanded", nextHidden ? "false" : "true");
            };
          }
        } else {
          indexNode.hidden = true;
          indexNode.innerHTML = "";
          if (indexToggleNode) {
            indexToggleNode.hidden = true;
          }
        }
      }
      listNode.innerHTML = groupedHtml;
      return;
    }

    if (indexNode) {
      indexNode.hidden = true;
      indexNode.innerHTML = "";
    }
    if (indexToggleNode) {
      indexToggleNode.hidden = true;
      indexToggleNode.onclick = null;
      indexToggleNode.setAttribute("aria-expanded", "false");
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
