# Krishna Pranay Blog Rulebook

This file defines the semantics and structure for every new page/section.

## 1) Core principles

1. Keep pages modular and data-driven.
2. Reuse shared assets from `assets/css` and `assets/js`.
3. Never hardcode section content inside HTML page templates.
4. Use consistent naming and folder conventions.

## 2) Folder semantics

- `index.html` = homepage that lists all sections.
- `sections/<section-key>.html` = section template page.
- `content/sections/<section-key>.json` = posts/content data for that section.
- `post.html` = reusable single-post template.
- `content/posts/<section-key>/<post-slug>.json` = full article content.
- `assets/js/site-config.js` = global site metadata + section registry.
- `assets/js/home.js` = homepage rendering logic.
- `assets/js/section.js` = reusable section page logic.
- `assets/js/post.js` = reusable single-post rendering logic.
- `assets/css/styles.css` = shared styles.

## 3) Naming conventions

- Use lowercase kebab-case for section keys and filenames.
  - Good: `market-psychology`
  - Bad: `MarketPsychology`
- Section keys in `site-config.js` must exactly match:
  - `sections/<key>.html`
  - `content/sections/<key>.json`
  - `body data-section="<key>"`

## 4) Page template contract

Every section HTML page must:

1. Include `data-section="<key>"` on `<body>`.
2. Include these target nodes:
   - `[data-section-title]`
   - `[data-section-description]`
   - `[data-post-list]`
3. Load scripts in this order:
   1. `../assets/js/site-config.js`
   2. `../assets/js/section.js`

## 5) Content contract

Each section data file must follow this JSON shape:

```json
{
  "posts": [
    {
      "slug": "post-slug",
      "title": "Post title",
      "date": "YYYY-MM-DD",
      "summary": "1-2 sentence summary",
      "ctaLabel": "Quirky custom button label",
      "image": "assets/images/posts/<section-key>/<post-slug>.svg",
      "imageAlt": "Accessible short image description"
    }
  ]
}
```

Rules:
- Keep `slug` in lowercase kebab-case.
- Keep `date` format as `YYYY-MM-DD`.
- Keep summaries concise and informative.
- Add a quirky `ctaLabel` for every post card button.
- Keep each `ctaLabel` unique per post (avoid repeating generic labels).
- Keep `image` path relative to project root.
- Keep `imageAlt` meaningful for accessibility.
- Add newest posts first.

## 6) Single-post content contract

Each file in `content/posts/<section-key>/<post-slug>.json` must follow:

```json
{
  "title": "Post title",
  "date": "YYYY-MM-DD",
  "summary": "1-2 sentence summary",
  "markdownFile": "content/posts/<section-key>/<post-slug>.md"
}
```

Rules:
- `<post-slug>.json` must match the `slug` in section list JSON.
- Prefer `markdownFile` for authoring comfort.
- Markdown supports:
  - headings via `## Heading`
  - paragraphs separated by blank lines
  - images via `![alt](path "optional caption")`
  - quotes via `> quote text`
  - major section headings should use Roman numerals (`I.`, `II.`, `III.`...).
  - sub-section/activity headings under a major section should use Arabic numerals (`1.`, `2.`, `3.`...).
- Keep markdown files at `content/posts/<section-key>/<post-slug>.md`.
- Legacy `blocks` and `content` arrays are still supported for backward compatibility.
- when user provides new raw content, normalize grammar and punctuation while preserving tone/meaning.
- merge over-fragmented one-line blocks into coherent paragraphs when readability improves.
- keep clear section labels as headings with concise wording.

## 7) How to add a new section

1. Add a section object in `assets/js/site-config.js`.
2. Create `sections/<new-key>.html` by copying an existing section page.
3. Update `<title>` and `<body data-section="...">`.
4. Create `content/sections/<new-key>.json` using the content contract.
5. Open `index.html` in browser and verify the new section card appears and links correctly.

## 8) How to add a new post

1. Open `content/sections/<key>.json`.
2. Insert a post object at the top of `posts` with `slug`, `title`, `date`, `summary`, and a unique quirky `ctaLabel`.
3. Create `content/posts/<key>/<slug>.md` with the post body.
4. Create `content/posts/<key>/<slug>.json` with metadata and `markdownFile`.
5. Refresh section page and click "Read post" to verify the article opens.

## 9) SEO + discoverability checklist for every new post

When adding any new post, always do all of the following:

1. Add the post to `content/sections/<key>.json` (this powers cards and Related Reads).
2. Add a unique quirky `ctaLabel` in section data (do not reuse generic labels).
3. Ensure `summary` is clear and search-friendly (concise, specific, human language).
4. Ensure `imageAlt` is meaningful whenever an image is used.
5. Add at least 2 contextual internal links inside the post body where relevant.
6. Set/verify a share-ready OG image for the post (or use a section-level fallback image).
7. Add/update the post in `sitemap.xml` with the correct URL and `lastmod`.
8. Keep `robots.txt` sitemap pointer intact: `Sitemap: https://krishnapranay.com/sitemap.xml`.
9. After deployment, submit/inspect the URL in Google Search Console.
10. Check analytics after publish to confirm pageviews are being captured for the new URL.
