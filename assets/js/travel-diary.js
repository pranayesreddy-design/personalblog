const { escapeHtml } = window.SECTION_UTILS || {};

const ENTRIES_PER_BATCH = 3;

// Orientation fixes how many photos share a row; ratio is written the way it is
// spoken ("4:3") and flipped for portrait.
const PHOTOS_PER_ROW = {
  portrait: 3,
  landscape: 2
};

const ASPECT_RATIOS = {
  "portrait|4:3": "3 / 4",
  "portrait|3:2": "2 / 3",
  "landscape|4:3": "4 / 3",
  "landscape|3:2": "3 / 2"
};

const DEFAULT_ORIENTATION = "landscape";
const DEFAULT_RATIO = "4:3";

function normalizeOrientation(value) {
  return PHOTOS_PER_ROW[value] ? value : DEFAULT_ORIENTATION;
}

function normalizeRatio(value) {
  return value === "3:2" || value === "4:3" ? value : DEFAULT_RATIO;
}

function formatEntryDate(value) {
  const raw = String(value || "").trim();
  const parts = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) {
    return { label: raw, iso: raw };
  }
  const date = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
  if (Number.isNaN(date.getTime())) {
    return { label: raw, iso: raw };
  }
  const label = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
  return { label, iso: raw };
}

function renderPhotoGrid(entry) {
  const photos = Array.isArray(entry.photos) ? entry.photos.filter((photo) => photo && photo.src) : [];
  if (!photos.length) {
    return "";
  }

  const orientation = normalizeOrientation(entry.orientation);
  const ratio = normalizeRatio(entry.ratio);
  const perRow = PHOTOS_PER_ROW[orientation];
  const aspectRatio = ASPECT_RATIOS[`${orientation}|${ratio}`];

  const itemsHtml = photos
    .map((photo) => {
      const src = escapeHtml(photo.src);
      const alt = escapeHtml(photo.alt || entry.title || "Travel diary photo");
      const caption = photo.caption
        ? `<figcaption>${escapeHtml(photo.caption)}</figcaption>`
        : "";
      return `
        <figure class="diary-photo">
          <img src="../${src}" alt="${alt}" loading="lazy" decoding="async" />
          ${caption}
        </figure>
      `;
    })
    .join("");

  return `
    <div
      class="diary-grid diary-grid--${orientation}"
      style="--diary-columns: ${perRow}; --diary-aspect: ${aspectRatio};"
    >${itemsHtml}</div>
  `;
}

function renderEntry(entry) {
  const { label, iso } = formatEntryDate(entry.date);
  const dateHtml = label
    ? `<time class="diary-date" datetime="${escapeHtml(iso)}">${escapeHtml(label)}</time>`
    : "";
  const locationHtml = entry.location
    ? `<p class="diary-location">${escapeHtml(entry.location)}</p>`
    : "";
  const titleHtml = entry.title
    ? `<h2 class="diary-title">${escapeHtml(entry.title)}</h2>`
    : "";
  const paragraphs = Array.isArray(entry.text) ? entry.text : [entry.text];
  const textHtml = paragraphs
    .filter(Boolean)
    .map((paragraph) => `<p class="diary-text">${escapeHtml(paragraph)}</p>`)
    .join("");

  return `
    <article class="diary-entry">
      <header class="diary-entry-header">
        ${dateHtml}
        ${locationHtml}
      </header>
      ${titleHtml}
      ${textHtml}
      ${renderPhotoGrid(entry)}
    </article>
  `;
}

function updateDiaryStatus(statusNode, hasMore) {
  if (!statusNode) {
    return;
  }
  if (hasMore) {
    statusNode.textContent = "";
    return;
  }
  statusNode.textContent = "That is everything so far.";
  statusNode.classList.add("diary-status--done");
}

async function renderTravelDiary() {
  const listNode = document.querySelector("[data-diary-list]");
  const statusNode = document.querySelector("[data-diary-status]");
  const sentinelNode = document.querySelector("[data-diary-sentinel]");
  const config = window.BLOG_CONFIG;
  const seo = window.SEO_UTILS;
  const lazyFeed = window.LAZY_FEED;

  if (!window.SECTION_UTILS || !lazyFeed || !listNode || !config) {
    return;
  }

  if (seo) {
    seo.setSeo({
      title: `Travel Diary | ${config.siteTitle || "Krishna Pranay"}`,
      description: "A running travel diary of dates, photos, and short notes from the road.",
      path: "/sections/travel-diary.html",
      type: "website",
      image: "/assets/images/favicon-astronaut.png",
      // Unpublished: drop this line when the diary goes live.
      robots: "noindex,nofollow"
    });
  }

  try {
    const version = encodeURIComponent(config.contentVersion || "1");
    const response = await fetch(`../content/travel-diary.json?v=${version}`);
    const data = await response.json();
    const entries = Array.isArray(data.entries) ? data.entries.filter(Boolean) : [];

    if (!entries.length) {
      listNode.innerHTML = '<p class="empty-state">No diary entries yet.</p>';
      if (statusNode) {
        statusNode.textContent = "";
      }
      return;
    }

    if (seo) {
      seo.setStructuredData("travel-diary", {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Travel Diary",
        url: seo.absoluteUrl("/sections/travel-diary.html"),
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: entries.length
        }
      });
    }

    lazyFeed.mountLazyFeed({
      items: entries,
      batchSize: ENTRIES_PER_BATCH,
      sentinelNode,
      renderItem: (entry) => lazyFeed.appendHtml(listNode, renderEntry(entry)),
      onBatch: (hasMore) => updateDiaryStatus(statusNode, hasMore)
    });
  } catch (error) {
    listNode.innerHTML = '<p class="empty-state">Unable to load the travel diary.</p>';
    if (statusNode) {
      statusNode.textContent = "";
    }
  }
}

document.addEventListener("DOMContentLoaded", renderTravelDiary);
