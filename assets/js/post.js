function getPostParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    section: params.get("section"),
    slug: params.get("slug")
  };
}

function fillPostHeader(sectionTitle, postTitle, postDate, postSummary) {
  const sectionNode = document.querySelector("[data-post-section]");
  const titleNode = document.querySelector("[data-post-title]");
  const dateNode = document.querySelector("[data-post-date]");
  const summaryNode = document.querySelector("[data-post-summary]");

  if (!sectionNode || !titleNode || !dateNode || !summaryNode) {
    return false;
  }

  sectionNode.textContent = sectionTitle;
  titleNode.textContent = postTitle;
  dateNode.textContent = postDate;
  summaryNode.textContent = postSummary;
  return true;
}

const escapeHtml = window.SECTION_UTILS && window.SECTION_UTILS.escapeHtml
  ? window.SECTION_UTILS.escapeHtml
  : function localEscapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

function toSafeHref(rawHref) {
  const href = String(rawHref || "").trim();
  if (!href) {
    return "#";
  }
  if (/^(https?:|mailto:|tel:)/i.test(href) || href.startsWith("/") || href.startsWith("./") || href.startsWith("../")) {
    return href;
  }
  return "#";
}

function renderPlainTextWithLinksAndStrong(textValue) {
  const raw = String(textValue || "");
  const tokenPattern = /(\*\*([^*]+)\*\*)|(https?:\/\/[^\s<]+)/g;
  let html = "";
  let cursor = 0;
  let match;

  while ((match = tokenPattern.exec(raw))) {
    html += escapeHtml(raw.slice(cursor, match.index));

    if (match[2]) {
      html += `<strong>${escapeHtml(match[2])}</strong>`;
      cursor = match.index + match[1].length;
      continue;
    }

    const url = match[3];
    const href = escapeHtml(toSafeHref(url));
    const label = escapeHtml(url);
    html += `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    cursor = match.index + url.length;
  }

  html += escapeHtml(raw.slice(cursor));
  return html;
}

function renderInlineText(value) {
  const source = String(value || "");
  const markdownLinkPattern = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let html = "";
  let cursor = 0;
  let match;

  while ((match = markdownLinkPattern.exec(source))) {
    const before = source.slice(cursor, match.index);
    html += renderPlainTextWithLinksAndStrong(before);
    const label = escapeHtml(match[1]);
    const href = escapeHtml(toSafeHref(match[2]));
    html += `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    cursor = match.index + match[0].length;
  }

  html += renderPlainTextWithLinksAndStrong(source.slice(cursor));
  return html;
}

function classifyTextBlock(value) {
  const trimmed = value.trim();
  const headingPattern = /^[IVXLC]+\.\s+[A-Za-z0-9 ,:&'()/-]+$/;
  const quotePattern = /^(["“]).+\1(\s*[-–—]\s*.+)?$/;

  if (headingPattern.test(trimmed)) {
    return "heading";
  }

  if (quotePattern.test(trimmed)) {
    return "quote";
  }

  return "paragraph";
}

function renderTextBlock(block, isLead) {
  const value = String(block.value || "").trim();
  if (!value) {
    return { html: "", isParagraph: false };
  }

  const safeValue = renderInlineText(value);
  const kind = classifyTextBlock(value);

  if (kind === "heading") {
    return {
      html: `<h3 class="flow-heading">${safeValue}</h3>`,
      isParagraph: false
    };
  }

  if (kind === "quote") {
    return {
      html: `<blockquote class="flow-quote"><p>${safeValue}</p></blockquote>`,
      isParagraph: false
    };
  }

  return {
    html: `<p class="flow-paragraph${isLead ? " flow-lead" : ""}">${safeValue}</p>`,
    isParagraph: true
  };
}

function renderImageBlock(block) {
  const layout = block.layout === "landscape" || block.layout === "portrait" || block.layout === "inline" || block.layout === "inline-each" || block.layout === "inline-landscape"
    ? block.layout
    : "default";
  const figureClass = layout === "default"
    ? "flow-image"
    : `flow-image flow-image--${layout}`;
  const caption = block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : "";
  const alt = escapeHtml(block.alt || "Post image");
  const src = escapeHtml(block.src);
  return `
    <figure class="${figureClass}">
      <img class="post-image" src="./${src}" alt="${alt}" loading="lazy" />
      ${caption}
    </figure>
  `;
}

function renderInlineGallery(blocks, useSharedCaption) {
  if (useSharedCaption) {
    const galleryCaptionBlock = blocks.find((item) => String(item.caption || "").trim());
    const galleryCaption = galleryCaptionBlock
      ? `<p class="flow-inline-gallery-caption">${escapeHtml(String(galleryCaptionBlock.caption).trim())}</p>`
      : "";
    const imagesHtml = blocks
      .map((item) => renderImageBlock({ ...item, caption: "" }))
      .join("");

    return `<div class="flow-inline-gallery flow-inline-gallery--shared">${imagesHtml}</div>${galleryCaption}`;
  }

  const imagesHtml = blocks.map((item) => renderImageBlock(item)).join("");
  return `<div class="flow-inline-gallery flow-inline-gallery--each">${imagesHtml}</div>`;
}

function parseImageMeta(altText, captionText) {
  const rawAlt = String(altText || "").trim();
  const rawCaption = String(captionText || "").trim();
  let layout = "default";
  let caption = rawCaption;

  const layoutMatch = rawCaption.match(/\|\s*(landscape|portrait|inline-landscape|inline-each|inline|default)\s*$/i);
  if (layoutMatch) {
    layout = layoutMatch[1].toLowerCase();
    caption = rawCaption.replace(/\|\s*(landscape|portrait|inline-landscape|inline-each|inline|default)\s*$/i, "").trim();
  }

  return {
    alt: rawAlt || "Post image",
    caption,
    layout
  };
}

function parseMarkdownToBlocks(markdownText) {
  const lines = String(markdownText || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let paragraphLines = [];

  function parseListChunk(startIndex) {
    const listLines = [];
    let cursor = startIndex;

    while (cursor < lines.length) {
      const line = lines[cursor];
      if (!line.trim()) {
        let lookAhead = cursor + 1;
        while (lookAhead < lines.length && !lines[lookAhead].trim()) {
          lookAhead += 1;
        }
        const nextLine = lines[lookAhead] || "";
        const nextIsListLine = /^(\s*)\d+\.\s+(.+)$/.test(nextLine) || /^(\s*)[-*]\s+(.+)$/.test(nextLine);
        if (nextIsListLine) {
          cursor = lookAhead;
          continue;
        }
        break;
      }

      const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
      const unorderedMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
      if (!orderedMatch && !unorderedMatch) {
        break;
      }

      if (orderedMatch) {
        listLines.push({
          level: Math.floor((orderedMatch[1] || "").length / 2),
          ordered: true,
          marker: Number(orderedMatch[2]),
          value: orderedMatch[3].trim()
        });
      } else {
        listLines.push({
          level: Math.floor((unorderedMatch[1] || "").length / 2),
          ordered: false,
          marker: null,
          value: unorderedMatch[2].trim()
        });
      }

      cursor += 1;
    }

    const root = { children: [] };
    const stack = [{ level: -1, node: root }];

    listLines.forEach((line) => {
      while (stack.length > 1 && line.level <= stack[stack.length - 1].level) {
        stack.pop();
      }

      const parent = stack[stack.length - 1].node;
      const item = {
        ordered: line.ordered,
        marker: line.marker,
        value: line.value,
        children: []
      };
      parent.children.push(item);
      stack.push({ level: line.level, node: item });
    });

    return {
      block: {
        type: "list",
        items: root.children
      },
      nextIndex: cursor
    };
  }

  const flushParagraph = () => {
    if (!paragraphLines.length) {
      return;
    }
    const value = paragraphLines.join(" ").replace(/\s+/g, " ").trim();
    if (value) {
      blocks.push({ type: "text", value });
    }
    paragraphLines = [];
  };

  for (let index = 0; index < lines.length;) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushParagraph();
      index += 1;
      continue;
    }

    const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)$/);
    if (imageMatch) {
      flushParagraph();
      const imageMeta = parseImageMeta(imageMatch[1], imageMatch[3] || "");
      blocks.push({
        type: "image",
        alt: imageMeta.alt,
        src: imageMatch[2],
        caption: imageMeta.caption,
        layout: imageMeta.layout
      });
      index += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      blocks.push({ type: "heading", value: headingMatch[1].trim() });
      index += 1;
      continue;
    }

    const quoteMatch = trimmed.match(/^>\s+(.+)$/);
    if (quoteMatch) {
      flushParagraph();
      blocks.push({ type: "quote", value: quoteMatch[1].trim() });
      index += 1;
      continue;
    }

    const orderedListMatch = rawLine.match(/^(\s*)\d+\.\s+(.+)$/);
    const unorderedListMatch = rawLine.match(/^(\s*)[-*]\s+(.+)$/);
    if (orderedListMatch || unorderedListMatch) {
      flushParagraph();
      const { block, nextIndex } = parseListChunk(index);
      blocks.push(block);
      index = nextIndex;
      continue;
    }

    paragraphLines.push(trimmed);
    index += 1;
  }

  flushParagraph();
  return blocks;
}

function buildBlocksFromLegacyFields(post) {
  const blocks = [];

  if (post.image) {
    blocks.push({
      type: "image",
      src: post.image,
      alt: post.imageAlt || post.title || "Post image",
      layout: (post.imageLayout === "landscape" || post.imageLayout === "portrait")
        ? post.imageLayout
        : "default"
    });
  }

  if (Array.isArray(post.content)) {
    post.content.forEach((paragraph) => {
      if (paragraph) {
        blocks.push({ type: "text", value: paragraph });
      }
    });
  }

  if (Array.isArray(post.images)) {
    post.images.forEach((image) => {
      if (image && image.src) {
        blocks.push({
          type: "image",
          src: image.src,
          alt: image.alt || "Post image",
          caption: image.caption || "",
          layout: (image.layout === "landscape" || image.layout === "portrait")
            ? image.layout
            : "default"
        });
      }
    });
  }

  return blocks;
}

async function resolvePostBlocks(post, version) {
  if (typeof post.markdownFile === "string" && post.markdownFile.trim()) {
    const markdownPath = post.markdownFile.replace(/^\.\//, "").trim();
    const markdownUrl = `./${encodeURI(markdownPath)}?v=${version}`;
    const response = await fetch(markdownUrl);
    if (!response.ok) {
      throw new Error("Unable to load markdown content.");
    }
    const markdownText = await response.text();
    return parseMarkdownToBlocks(markdownText);
  }

  if (Array.isArray(post.blocks) && post.blocks.length) {
    return post.blocks;
  }

  return buildBlocksFromLegacyFields(post);
}

function renderListItems(items) {
  if (!Array.isArray(items) || !items.length) {
    return "";
  }

  const groups = [];
  items.forEach((item) => {
    const lastGroup = groups[groups.length - 1];
    if (!lastGroup || lastGroup.ordered !== item.ordered) {
      groups.push({ ordered: item.ordered, items: [item] });
      return;
    }
    lastGroup.items.push(item);
  });

  return groups
    .map((group) => {
      const listTag = group.ordered ? "ol" : "ul";
      const startValue = group.ordered && Number.isInteger(group.items[0].marker)
        ? group.items[0].marker
        : 1;
      const startAttr = group.ordered && startValue > 1 ? ` start="${startValue}"` : "";
      const innerHtml = group.items
        .map((item) => {
          const value = renderInlineText(item.value || "");
          const childHtml = item.children && item.children.length
            ? renderListItems(item.children)
            : "";
          return `<li>${value}${childHtml}</li>`;
        })
        .join("");

      return `<${listTag} class="flow-list"${startAttr}>${innerHtml}</${listTag}>`;
    })
    .join("");
}

function renderPostFlow(blocks) {
  const flowNode = document.querySelector("[data-post-flow]");
  if (!flowNode) {
    return;
  }

  if (!blocks.length) {
    flowNode.innerHTML = '<p class="empty-state">Post body is empty.</p>';
    return;
  }

  let hasLeadParagraph = false;
  const htmlChunks = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];

    if (block.type === "image" && block.src) {
      if (block.layout === "inline" || block.layout === "inline-each" || block.layout === "inline-landscape") {
        const isSharedInline = block.layout === "inline";
        const inlineBlocks = [{ ...block }];
        while (index + 1 < blocks.length) {
          const nextBlock = blocks[index + 1];
          if (!nextBlock || nextBlock.type !== "image" || !nextBlock.src || nextBlock.layout !== block.layout) {
            break;
          }
          inlineBlocks.push({ ...nextBlock });
          index += 1;
        }
        htmlChunks.push(renderInlineGallery(inlineBlocks, isSharedInline));
        continue;
      }

      htmlChunks.push(renderImageBlock(block));
      continue;
    }

    if (block.type === "heading" && block.value) {
      htmlChunks.push(`<h3 class="flow-heading">${escapeHtml(String(block.value).trim())}</h3>`);
      continue;
    }

    if (block.type === "quote" && block.value) {
      htmlChunks.push(`<blockquote class="flow-quote"><p>${escapeHtml(String(block.value).trim())}</p></blockquote>`);
      continue;
    }

    if (block.type === "list" && Array.isArray(block.items) && block.items.length) {
      htmlChunks.push(renderListItems(block.items));
      continue;
    }

    if (block.type === "text" && block.value) {
      const rendered = renderTextBlock(block, !hasLeadParagraph);
      if (rendered.isParagraph) {
        hasLeadParagraph = true;
      }
      htmlChunks.push(rendered.html);
    }
  }

  flowNode.innerHTML = htmlChunks.join("");
}

function renderPostError(message) {
  const errorNode = document.querySelector("[data-post-error]");
  if (errorNode) {
    errorNode.textContent = message;
  }
}

function flattenSectionPosts(data) {
  const collected = [];
  const seen = new Set();
  let order = 0;

  function appendPost(post, context) {
    if (!post || !post.slug || seen.has(post.slug)) {
      return;
    }
    seen.add(post.slug);
    collected.push({
      post,
      order: order += 1,
      groupIndex: context && Number.isInteger(context.groupIndex) ? context.groupIndex : null,
      subgroupIndex: context && Number.isInteger(context.subgroupIndex) ? context.subgroupIndex : null
    });
  }

  const flatPosts = Array.isArray(data.posts) ? data.posts : [];
  flatPosts.forEach((post) => appendPost(post, null));

  const groups = Array.isArray(data.groups) ? data.groups : [];
  groups.forEach((group, groupIndex) => {
    const groupPosts = Array.isArray(group.posts) ? group.posts : [];
    groupPosts.forEach((post) => appendPost(post, { groupIndex, subgroupIndex: null }));

    const subgroups = Array.isArray(group.subgroups) ? group.subgroups : [];
    subgroups.forEach((subgroup, subgroupIndex) => {
      const subgroupPosts = Array.isArray(subgroup.posts) ? subgroup.posts : [];
      subgroupPosts.forEach((post) => appendPost(post, { groupIndex, subgroupIndex }));
    });
  });

  return collected;
}

async function renderRelatedReads(sectionKey, currentSlug, sectionMeta, version) {
  const relatedNode = document.querySelector("[data-related-reads]");
  if (!relatedNode) {
    return;
  }

  try {
    const response = await fetch(`./content/sections/${sectionKey}.json?v=${version}`);
    const data = await response.json();
    const entries = flattenSectionPosts(data);
    const currentEntry = entries.find((entry) => entry.post.slug === currentSlug) || null;
    const relatedPosts = entries
      .filter((entry) => entry.post.slug !== currentSlug && !entry.post.indexHidden)
      .sort((a, b) => {
        const aScore = getRelatedScore(a, currentEntry);
        const bScore = getRelatedScore(b, currentEntry);
        if (aScore !== bScore) {
          return bScore - aScore;
        }
        return a.order - b.order;
      })
      .slice(0, 3)
      .map((entry) => entry.post);

    if (!relatedPosts.length) {
      relatedNode.hidden = true;
      relatedNode.innerHTML = "";
      return;
    }

    const ctaStyle = sectionMeta && sectionMeta.ctaBackground
      ? `style="background-image: linear-gradient(120deg, rgba(0, 0, 0, 0.42), rgba(0, 0, 0, 0.18)), url('./${escapeHtml(sectionMeta.ctaBackground)}');"`
      : "";

    const relatedPostPreviews = await Promise.all(
      relatedPosts.map(async (post) => {
        try {
          const previewResponse = await fetch(`./content/posts/${sectionKey}/${encodeURIComponent(post.slug)}.json?v=${version}`);
          const previewData = await previewResponse.json();
          return {
            ...post,
            image: previewData.image || post.image || "",
            imageAlt: previewData.imageAlt || post.imageAlt || post.title || "Related post image"
          };
        } catch (error) {
          return {
            ...post,
            image: post.image || "",
            imageAlt: post.imageAlt || post.title || "Related post image"
          };
        }
      })
    );

    relatedNode.innerHTML = `
      <h2>Related Reads</h2>
      <div class="section-grid related-grid">
        ${relatedPostPreviews
          .map((post) => {
            const postUrl = `./post.html?section=${encodeURIComponent(sectionKey)}&slug=${encodeURIComponent(post.slug)}`;
            const title = escapeHtml(post.title || post.slug);
            const summary = escapeHtml(post.summary || "");
            const date = escapeHtml(post.date || "");
            const ctaLabel = escapeHtml(post.ctaLabel || "Read next");
            const overlayLabel = escapeHtml(`Open ${post.title || "post"}`);
            const imageNode = post.image
              ? `<img class="post-image" src="./${escapeHtml(post.image)}" alt="${escapeHtml(post.imageAlt || post.title || "Related post image")}" loading="lazy" />`
              : "";
            return `
              <article class="card related-card post-card--clickable">
                <a class="card-link-overlay" href="${postUrl}" aria-label="${overlayLabel}"></a>
                ${imageNode}
                ${date ? `<p class="eyebrow">${date}</p>` : ""}
                <h3>${title}</h3>
                ${summary ? `<p>${summary}</p>` : ""}
                <a class="button section-cta" ${ctaStyle} href="${postUrl}">${ctaLabel}</a>
              </article>
            `;
          })
          .join("")}
      </div>
    `;
    relatedNode.hidden = false;
  } catch (error) {
    relatedNode.hidden = true;
    relatedNode.innerHTML = "";
  }
}

function getRelatedScore(candidateEntry, currentEntry) {
  if (!currentEntry) {
    return 1;
  }

  if (candidateEntry.groupIndex === currentEntry.groupIndex) {
    const bothInSubgroup = Number.isInteger(candidateEntry.subgroupIndex) && Number.isInteger(currentEntry.subgroupIndex);
    if (bothInSubgroup && candidateEntry.subgroupIndex === currentEntry.subgroupIndex) {
      return 3;
    }
    return 2;
  }

  return 1;
}

async function renderPost() {
  const config = window.BLOG_CONFIG;
  const params = getPostParams();
  const seo = window.SEO_UTILS;

  if (!config || !params.section || !params.slug) {
    renderPostError("Missing post parameters.");
    return;
  }

  const sectionMeta = config.sections.find((section) => section.key === params.section);
  if (!sectionMeta) {
    renderPostError("Unknown section.");
    return;
  }

  const backNode = document.querySelector("[data-back-to-section]");
  if (backNode) {
    backNode.href = `./sections/${params.section}.html`;
  }

  try {
    const version = encodeURIComponent(config.contentVersion || "1");
    const response = await fetch(`./content/posts/${params.section}/${params.slug}.json?v=${version}`);
    const post = await response.json();

    const hasHeader = fillPostHeader(
      sectionMeta.title,
      post.title || "Untitled post",
      post.date || "",
      post.summary || ""
    );

    if (!hasHeader) {
      renderPostError("Unable to render post.");
      return;
    }

    const blocks = await resolvePostBlocks(post, version);
    if (seo) {
      const firstImageBlock = blocks.find((block) => block && block.type === "image" && block.src);
      const imagePath = firstImageBlock ? `/${String(firstImageBlock.src).replace(/^\/+/, "")}` : "/assets/images/favicon-astronaut.png";
      const pagePath = `/post.html?section=${encodeURIComponent(params.section)}&slug=${encodeURIComponent(params.slug)}`;
      const pageTitle = `${post.title || "Post"} | ${config.siteTitle || "Krishna Pranay"}`;
      const pageDescription = post.summary || sectionMeta.description || config.siteTagline || "";
      seo.setSeo({
        title: pageTitle,
        description: pageDescription,
        path: pagePath,
        type: "article",
        image: imagePath
      });
      seo.setStructuredData("post-article", {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: post.title || "Post",
        datePublished: post.date || "",
        description: pageDescription,
        image: seo.absoluteUrl(imagePath),
        author: {
          "@type": "Person",
          name: config.owner || "Krishna Pranay"
        },
        mainEntityOfPage: seo.absoluteUrl(pagePath)
      });
    }
    renderPostFlow(blocks);
    await renderRelatedReads(params.section, params.slug, sectionMeta, version);
  } catch (error) {
    renderPostError("Unable to load post.");
  }
}

document.addEventListener("DOMContentLoaded", renderPost);
