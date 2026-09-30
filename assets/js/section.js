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

// Card images are the heavy part of a section page, so only enough cards to
// cover a first screen are rendered up front.
const CARDS_PER_BATCH = 6;

// Collects the cards every grid wants and hands back a placeholder to render in
// their place. Cards are queued in document order, so revealing them in queue
// order fills the page from the top down.
function createCardQueue() {
  const placements = [];
  let gridCount = 0;

  function reserveGrid(cardHtmlList) {
    gridCount += 1;
    const gridKey = `grid-${gridCount}`;
    cardHtmlList.forEach((html) => placements.push({ gridKey, html }));
    return gridKey;
  }

  return { placements, reserveGrid };
}

function createPostCard(sectionMeta, post, cardId) {
  const postUrl = getPostUrl(post.slug, sectionMeta.key, "../");
  const cardClass = sectionMeta.key === "travel"
    ? "card post-card post-card--travel post-card--clickable"
    : "card post-card post-card--clickable";
  const ctaLabel = escapeHtml(post.ctaLabel || "Read post");
  const overlayLabel = escapeHtml(`Open ${post.title || "post"}`);
  const imageNode = post.image
    ? `<img class="post-image" src="../${post.image}" alt="${post.imageAlt || post.title}" loading="lazy" decoding="async" />`
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

function renderPostIndex(sectionMeta, posts) {
  const validPosts = toValidPosts(posts).filter((post) => !post.indexHidden);
  if (!validPosts.length) {
    return '<p class="empty-state">No posts yet in this section.</p>';
  }
  const itemsHtml = validPosts
    .map((post) => {
      const postTitle = escapeHtml(post.title || post.slug || "Untitled post");
      const postHref = getPostUrl(post.slug, sectionMeta.key, "../");
      const postDate = post.date ? `<span class="index-date">${escapeHtml(post.date)}</span>` : "";
      return `<li><a href="${postHref}">${postTitle}</a>${postDate}</li>`;
    })
    .join("");
  return `<nav class="card section-index"><ol class="section-index-list">${itemsHtml}</ol></nav>`;
}

function renderPostGrid(sectionMeta, posts, scopeId, cardQueue) {
  const validPosts = toValidPosts(posts);
  if (!validPosts.length) {
    return '<p class="empty-state">No posts yet in this section.</p>';
  }
  const cardHtmlList = validPosts.map((post, postIndex) =>
    createPostCard(sectionMeta, post, scopeId ? getPostAnchorId(scopeId, post, postIndex) : ""));
  const gridKey = cardQueue.reserveGrid(cardHtmlList);
  return `<div class="section-grid" data-card-grid="${gridKey}"></div>`;
}

function renderGroupedPosts(sectionMeta, groups, cardQueue) {
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
      // Subgroups are emitted above the group's own posts, so they have to be
      // built first to keep the card queue in document order.
      const subgroupHtml = Array.isArray(group.subgroups) && group.subgroups.length
        ? group.subgroups
          .map((subgroup, subgroupIndex) => {
            const subgroupId = getSubgroupAnchorId(group, subgroup, groupIndex, subgroupIndex);
            const subgroupTitle = escapeHtml(subgroup.title || "Untitled subgroup");
            const subgroupDescription = subgroup.description
              ? `<p class="tagline subgroup-description">${escapeHtml(subgroup.description)}</p>`
              : "";
            const subgroupPostsHtml = renderPostGrid(sectionMeta, subgroup.posts, subgroupId, cardQueue);
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

      const groupPostsId = getGroupPostsAnchorId(group, groupIndex);
      const hasGroupPosts = toValidPosts(group.posts).length > 0;
      const groupPostsSectionTitle = escapeHtml(group.postsTitle || `More in ${groupTitle}`);
      const groupPostsHtml = renderPostGrid(sectionMeta, group.posts, groupPostsId, cardQueue);

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

// Pairs each queued card with the placeholder grid it belongs to, then lets the
// shared feed append them a batch at a time.
function mountCardFeed(rootNode, placements, sentinelNode) {
  const lazyFeed = window.LAZY_FEED;
  const gridNodes = new Map();
  const candidates = Array.from(rootNode.querySelectorAll("[data-card-grid]"));
  if (rootNode.dataset && rootNode.dataset.cardGrid) {
    candidates.push(rootNode);
  }
  candidates.forEach((gridNode) => {
    gridNodes.set(gridNode.dataset.cardGrid, gridNode);
  });

  const items = placements
    .map((placement) => ({ gridNode: gridNodes.get(placement.gridKey), html: placement.html }))
    .filter((item) => item.gridNode);

  if (!lazyFeed) {
    items.forEach((item) => {
      item.gridNode.insertAdjacentHTML("beforeend", item.html);
    });
    return;
  }

  lazyFeed.mountLazyFeed({
    items,
    batchSize: CARDS_PER_BATCH,
    sentinelNode,
    renderItem: (item) => lazyFeed.appendHtml(item.gridNode, item.html)
  });
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
  const sentinelNode = document.querySelector("[data-post-sentinel]");

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

    const posts = toValidPosts(data.posts);

    // Index layouts are plain text links, so there is nothing worth deferring
    // and holding them back would only hide them from find-in-page.
    if (sectionMeta.layout === "index" && posts.length) {
      listNode.innerHTML = renderPostIndex(sectionMeta, posts);
      return;
    }

    const cardQueue = createCardQueue();
    const groupedHtml = renderGroupedPosts(sectionMeta, data.groups, cardQueue);

    if (groupedHtml) {
      listNode.innerHTML = groupedHtml;
      mountCardFeed(listNode, cardQueue.placements, sentinelNode);
      return;
    }

    if (!posts.length) {
      listNode.innerHTML = '<p class="empty-state">No posts yet. Add one in content/sections.</p>';
      return;
    }

    // Ungrouped sections already style the list node as the grid, so cards are
    // queued straight into it rather than into a nested placeholder.
    listNode.innerHTML = "";
    listNode.dataset.cardGrid = cardQueue.reserveGrid(
      posts.map((post) => createPostCard(sectionMeta, post))
    );
    mountCardFeed(listNode, cardQueue.placements, sentinelNode);
  } catch (error) {
    listNode.innerHTML = '<p class="empty-state">Unable to load posts.</p>';
  }
}

document.addEventListener("DOMContentLoaded", renderSection);
