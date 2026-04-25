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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function classifyTextBlock(value) {
  const trimmed = value.trim();
  const headingPattern = /^[IVXLC]+\.\s+[A-Za-z0-9 ,&'()/-]+$/;
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

  const safeValue = escapeHtml(value);
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
  const caption = block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : "";
  const alt = escapeHtml(block.alt || "Post image");
  const src = escapeHtml(block.src);
  return `
    <figure class="flow-image">
      <img class="post-image" src="./${src}" alt="${alt}" loading="lazy" />
      ${caption}
    </figure>
  `;
}

function buildBlocksFromLegacyFields(post) {
  const blocks = [];

  if (post.image) {
    blocks.push({
      type: "image",
      src: post.image,
      alt: post.imageAlt || post.title || "Post image"
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
          caption: image.caption || ""
        });
      }
    });
  }

  return blocks;
}

function renderPostFlow(post) {
  const flowNode = document.querySelector("[data-post-flow]");
  if (!flowNode) {
    return;
  }

  const blocks = Array.isArray(post.blocks) && post.blocks.length
    ? post.blocks
    : buildBlocksFromLegacyFields(post);

  if (!blocks.length) {
    flowNode.innerHTML = '<p class="empty-state">Post body is empty.</p>';
    return;
  }

  let hasLeadParagraph = false;
  flowNode.innerHTML = blocks
    .map((block) => {
      if (block.type === "image" && block.src) {
        return renderImageBlock(block);
      }
      if (block.type === "text" && block.value) {
        const rendered = renderTextBlock(block, !hasLeadParagraph);
        if (rendered.isParagraph) {
          hasLeadParagraph = true;
        }
        return rendered.html;
      }
      return "";
    })
    .join("");
}

function renderPostError(message) {
  const errorNode = document.querySelector("[data-post-error]");
  if (errorNode) {
    errorNode.textContent = message;
  }
}

async function renderPost() {
  const config = window.BLOG_CONFIG;
  const params = getPostParams();

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

    renderPostFlow(post);
  } catch (error) {
    renderPostError("Unable to load post.");
  }
}

document.addEventListener("DOMContentLoaded", renderPost);
