const {
  escapeHtml,
  toValidPosts,
  getPostUrl
} = window.SECTION_UTILS || {};

function renderTravelIndex(groups) {
  const validGroups = Array.isArray(groups) ? groups : [];
  if (!validGroups.length) {
    return '<p class="empty-state">No grouped travel sections found.</p>';
  }

  function renderPostIndexItems(posts) {
    return toValidPosts(posts)
      .filter((post) => !post.indexHidden)
      .map((post) => {
        const postTitle = escapeHtml(post.title || post.slug || "Untitled post");
        const postHref = getPostUrl(post.slug, "travel", "../");
        const childItems = Array.isArray(post.indexChildren) ? post.indexChildren : [];
        const childHtml = childItems.length
          ? `<ul>${
            childItems
              .map((child) => {
                const childTitle = escapeHtml(child.title || child.slug || "Untitled child");
                const childSlug = child.slug || "";
                const childHref = getPostUrl(childSlug, "travel", "../");
                return `<li><a href="${childHref}">${childTitle}</a></li>`;
              })
              .join("")
          }</ul>`
          : "";
        return `<li><a href="${postHref}">${postTitle}</a>${childHtml}</li>`;
      })
      .join("");
  }

  const itemsHtml = validGroups
    .map((group) => {
      const groupTitle = escapeHtml(group.title || "Untitled group");

      const subgroupItems = Array.isArray(group.subgroups) ? group.subgroups : [];
      const subgroupHtml = subgroupItems
        .map((subgroup) => {
          const subgroupTitle = escapeHtml(subgroup.title || "Untitled subgroup");
          const subgroupPostItems = renderPostIndexItems(subgroup.posts);
          return `
            <li>
              <span class="index-label">${subgroupTitle}</span>
              ${subgroupPostItems ? `<ul>${subgroupPostItems}</ul>` : ""}
            </li>
          `;
        })
        .join("");

      const hasGroupPosts = toValidPosts(group.posts).length > 0;
      const groupPostsTitle = escapeHtml(group.postsTitle || `More in ${group.title || "this region"}`);
      const groupPostItems = renderPostIndexItems(group.posts);
      const groupPostsHtml = hasGroupPosts
        ? `
          <li>
            <span class="index-label">${groupPostsTitle}</span>
            ${groupPostItems ? `<ul>${groupPostItems}</ul>` : ""}
          </li>
        `
        : "";

      return `
        <li>
          <span class="index-label">${groupTitle}</span>
          ${(subgroupHtml || groupPostsHtml) ? `<ul>${subgroupHtml}${groupPostsHtml}</ul>` : ""}
        </li>
      `;
    })
    .join("");

  return `<ol class="section-index-list">${itemsHtml}</ol>`;
}

async function renderTravelIndexPage() {
  const indexNode = document.querySelector("[data-travel-index]");
  const seo = window.SEO_UTILS;
  if (!window.SECTION_UTILS) {
    return;
  }
  if (!indexNode || !window.BLOG_CONFIG) {
    return;
  }

  if (seo) {
    seo.setSeo({
      title: `Travel Index | ${window.BLOG_CONFIG.siteTitle || "Krishna Pranay"}`,
      description: "Nested travel index for regions, cities, and guides.",
      path: "/sections/travel-index.html",
      type: "website",
      image: "/assets/images/favicon-astronaut.png"
    });
  }

  try {
    const version = encodeURIComponent(window.BLOG_CONFIG.contentVersion || "1");
    const response = await fetch(`../content/sections/travel.json?v=${version}`);
    const data = await response.json();
    indexNode.innerHTML = renderTravelIndex(data.groups);
    if (seo) {
      const groupsCount = Array.isArray(data.groups) ? data.groups.length : 0;
      seo.setStructuredData("travel-index", {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Travel Index",
        url: seo.absoluteUrl("/sections/travel-index.html"),
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: groupsCount
        }
      });
    }
  } catch (error) {
    indexNode.innerHTML = '<p class="empty-state">Unable to load travel index.</p>';
  }
}

document.addEventListener("DOMContentLoaded", renderTravelIndexPage);
