(() => {
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
    return `group-${toAnchorSlug(group && group.title ? group.title : "group")}-${groupIndex + 1}`;
  }

  function getSubgroupAnchorId(group, subgroup, groupIndex, subgroupIndex) {
    const groupSlug = toAnchorSlug(group && group.title ? group.title : `group-${groupIndex + 1}`);
    const subgroupSlug = toAnchorSlug(subgroup && subgroup.title ? subgroup.title : "subgroup");
    return `subgroup-${groupSlug}-${subgroupSlug}-${subgroupIndex + 1}`;
  }

  function getGroupPostsAnchorId(group, groupIndex) {
    const groupSlug = toAnchorSlug(group && group.title ? group.title : "group");
    return `group-main-${groupSlug}-${groupIndex + 1}`;
  }

  function getPostAnchorId(scopeId, post, postIndex) {
    const postSlug = toAnchorSlug(post && (post.slug || post.title || `post-${postIndex + 1}`));
    return `${scopeId}-post-${postSlug}-${postIndex + 1}`;
  }

  function buildSectionCtaStyle(sectionMeta, prefix) {
    if (!sectionMeta || !sectionMeta.ctaBackground) {
      return "";
    }
    const normalizedPrefix = prefix || "";
    return `style="background-image: linear-gradient(120deg, rgba(0, 0, 0, 0.42), rgba(0, 0, 0, 0.18)), url('${normalizedPrefix}${sectionMeta.ctaBackground}');"`;
  }

  function getPostUrl(slug, sectionKey, prefix) {
    if (!slug) {
      return "#";
    }
    const section = sectionKey || "travel";
    const basePrefix = prefix || "";
    return `${basePrefix}post.html?section=${encodeURIComponent(section)}&slug=${encodeURIComponent(slug)}`;
  }

  window.SECTION_UTILS = {
    escapeHtml,
    toAnchorSlug,
    toValidPosts,
    getGroupAnchorId,
    getSubgroupAnchorId,
    getGroupPostsAnchorId,
    getPostAnchorId,
    buildSectionCtaStyle,
    getPostUrl
  };
})();
