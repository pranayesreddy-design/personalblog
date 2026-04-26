function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toAnchorSlug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toValidPosts(posts) {
  return Array.isArray(posts) ? posts.filter((post) => post && post.slug) : [];
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

function getPostUrl(slug) {
  return slug ? `../post.html?section=travel&slug=${encodeURIComponent(slug)}` : "#";
}

function renderTravelIndex(groups) {
  const validGroups = Array.isArray(groups) ? groups : [];
  if (!validGroups.length) {
    return '<p class="empty-state">No grouped travel sections found.</p>';
  }

  function renderPostIndexItems(posts, scopeId) {
    return toValidPosts(posts)
      .filter((post) => !post.indexHidden)
      .map((post, postIndex) => {
        const postTitle = escapeHtml(post.title || post.slug || "Untitled post");
        const postId = getPostAnchorId(scopeId, post, postIndex);
        const postHref = getPostUrl(post.slug);
        const childItems = Array.isArray(post.indexChildren) ? post.indexChildren : [];
        const childHtml = childItems.length
          ? `<ul>${
            childItems
              .map((child) => {
                const childTitle = escapeHtml(child.title || child.slug || "Untitled child");
                const childSlug = child.slug || "";
                const childHref = getPostUrl(childSlug);
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
              <span class="index-label">${subgroupTitle}</span>
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
  if (!indexNode || !window.BLOG_CONFIG) {
    return;
  }

  try {
    const version = encodeURIComponent(window.BLOG_CONFIG.contentVersion || "1");
    const response = await fetch(`../content/sections/travel.json?v=${version}`);
    const data = await response.json();
    indexNode.innerHTML = renderTravelIndex(data.groups);
  } catch (error) {
    indexNode.innerHTML = '<p class="empty-state">Unable to load travel index.</p>';
  }
}

document.addEventListener("DOMContentLoaded", renderTravelIndexPage);
