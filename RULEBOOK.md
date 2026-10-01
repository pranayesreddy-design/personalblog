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
- `sections/travel-diary.html` = running travel diary page.
- `content/travel-diary.json` = diary entries.
- `assets/js/travel-diary.js` = diary rendering logic.

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
   - `[data-post-sentinel]` (see section 10)
3. Load scripts in this order:
   1. `../assets/js/site-config.js`
   2. `../assets/js/lazy-feed.js`
   3. `../assets/js/section.js`

## 4b) Section layouts

A section object in `site-config.js` may set `layout`:

- omitted (default): posts render as image cards in a grid.
- `"index"`: posts render as a plain numbered list of links (title + date), no images or CTAs.

This applies to both the section page and the Related Reads block on that section's posts.

Use `"index"` for text-first sections where thumbnails add nothing.

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
  - bold via `**text**` and links via `[label](url)`
  - lists via `-` or `1.`, nested by indenting exactly 2 spaces per level

### Heading rules

- Never repeat the post title as a heading in the body. The page template already
  renders `title` as the `<h1>`, so a `# Title` line duplicates it.
- `##` = major section, prefixed with a Roman numeral (`I.`, `II.`, `III.`...),
  numbered sequentially from `I.` with no gaps.
- `###` = sub-section, prefixed with an Arabic numeral (`1.`, `2.`, `3.`...),
  restarting at `1.` inside each major section.
- `####` = leaf item under a sub-section, also prefixed with an Arabic numeral
  restarting at `1.`.
- A labelled sequence (`Day 1:`, `Day 2:`) is an accepted substitute for `1.`/`2.`
  at the `###` level when the label carries meaning, as in itinerary routes.
- Do not add a sub-heading that only restates its parent. Put the content directly
  under the major section instead.
- Heading level drives size on the page, so use the level that matches the real
  depth rather than picking one for appearance.

### Unsupported markdown

- Italics (`*text*`) are not parsed. Single asterisks render literally, so use
  `**bold**` or plain text.
- A list item's continuation line must be a nested list item (`  - ...`). A bare
  indented line ends the list and splits it into separate lists.
- Keep markdown files at `content/posts/<section-key>/<post-slug>.md`.
- Legacy `blocks` and `content` arrays are still supported for backward compatibility.
- when user provides new raw content, normalize grammar and punctuation while preserving tone/meaning.
- merge over-fragmented one-line blocks into coherent paragraphs when readability improves.
- keep clear section labels as headings with concise wording.

## 6b) Travel diary contract

The diary is a single continuous feed in `content/travel-diary.json`. Entries load
in batches of three as you scroll and stop when the list runs out.

```json
{
  "entries": [
    {
      "date": "YYYY-MM-DD",
      "location": "Neighbourhood, City",
      "title": "Short entry title",
      "text": ["Paragraph one.", "Paragraph two."],
      "orientation": "portrait",
      "ratio": "4:3",
      "photos": [
        { "src": "assets/images/posts/travel/<file>", "alt": "...", "caption": "..." }
      ]
    }
  ]
}
```

Photo rules, enforced by the renderer:

- `orientation` sets photos per row: `portrait` = 3 per row, `landscape` = 2 per row.
- `ratio` is `4:3` or `3:2`, always written landscape-style. Portrait entries flip it
  automatically, so `portrait` + `4:3` renders each photo as 3:4.
- Every photo inside one entry shares that orientation and ratio. Never mix
  orientations or ratios within an entry.
- To show both shapes on the same day, write two entries with the same `date`.
- Give each entry a photo count that is a multiple of its row size (3 or 2), otherwise
  the last row is left partially filled.
- Photos are cropped with `object-fit: cover`, so pick source images that already match
  the declared shape to avoid losing edges.
- Add newest entries first.

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

## 10) Lazy loading contract

`assets/js/lazy-feed.js` owns all progressive rendering. Never hand-roll another
IntersectionObserver; use `window.LAZY_FEED`:

- `mountLazyFeed({ items, batchSize, sentinelNode, renderItem, onBatch })` renders the
  first batch immediately and appends the rest as `sentinelNode` nears the viewport.
- `whenNearViewport(node, onReach)` runs a one-shot callback, for work that should not
  happen until the reader gets there.

Rules:

- A sentinel must be a `<div class="lazy-sentinel" data-*-sentinel aria-hidden="true">`
  placed after the content it guards. It needs a non-zero box and must not be `hidden`,
  or it can never intersect and nothing will load.
- Anything deferred must still be reachable. With no sentinel and no
  `IntersectionObserver`, both helpers fall back to rendering everything at once.
- Only defer weight. Card grids and photo feeds are batched; plain link lists
  (`layout: "index"`) and article body text are not, because deferring text saves
  nothing and hides it from find-in-page.

Image attributes, which `loading="lazy"` alone does not handle:

- Every content `<img>` needs `decoding="async"`.
- The first image in a post body is rendered `loading="eager" fetchpriority="high"`
  because it is the LCP element; every later image is `loading="lazy"`.
- Every image needs a CSS `aspect-ratio` so its box is reserved before it loads.
  Without one the page collapses, every image counts as on-screen, and lazy loading
  silently stops working.

To check a page really defers, count requests rather than trusting the attribute: serve
the site with a logging static server, load the page in headless Chrome at a normal
window size, and compare image requests against a deliberately tall window.

## 11) Wedding invite (work in progress)

Lives apart from the blog on purpose. It does not use `styles.css`, `site-config.js`, or
`seo.js`, so nothing here is affected by blog-wide changes and vice versa.

- `tools/invite/template.html` - the template, holding placeholder data. Kept out of `i/`
  on purpose: GitHub Pages serves every file in this repo, so a template under `i/preview/`
  would be a guessable live URL showing the whole invite.
- `assets/css/invite.css` - standalone theme, mobile-first.
- `assets/js/invite.js` - RSVP behaviour. `RSVP_ENDPOINT` is empty until the endpoint
  exists; the form says nothing was sent rather than faking success.
- `assets/images/invite/<token>.jpg` - per-guest photo, long edge 1000px.
- `tools/invite/fetch_guests.py` - pulls the guest list from the Google Sheet.
- `tools/invite/rsvp.gs` - the Apps Script that receives RSVPs into that same sheet.

Generated pages go to `i/<token>/index.html`. The template sits at the same depth
(`tools/invite/`) so its `../../assets/...` paths work unchanged once a page is rendered.

Generator: `tools/invite/generate.py`, pure stdlib Python, no node needed.

```
python3 tools/invite/generate.py --tokens tools/invite/guests.csv   # fill blank tokens
python3 tools/invite/generate.py --guests tools/invite/guests.csv --out dist --limit 5
```

Preview on a phone with `python3 tools/invite/serve.py`, which prints the LAN address and
detaches from the shell. Stop it with `--stop`. The address changes with the network.

Tokens are unlisted, not private. This repo is public, so anyone reading it can walk to
any `i/<token>/` path, and git history keeps them even after a delete. Fine for the
wedding details themselves; think before committing pages that carry guest photos.

`dist/` is standalone: it carries its own copy of the CSS, JS, and photos, so it can
be deployed on its own. It is gitignored, and so is a real `guests.csv`.

Guest row schema (one row per person):

```
token | name | photo_url | events_invited | rsvp_status | responded_at
```

`household_id` is accepted and ignored. The page no longer names the other people in a
household, so it only matters if you later want to group RSVPs.

Template contract:

- Every personalised value is marked `data-invite-field="..."`. The generator replaces
  text content by that attribute, so no `{{ }}` syntax is needed and the template stays
  a valid, viewable page. Per-guest fields: `name`, `token`, `guestPhoto`, `caption`.
  `couple` and `date` are shared and left exactly as authored.
- Optional regions are marked `data-invite-block="..."` and are removed whole.
- Nothing is matched by CSS class or by position, and every edit asserts how many nodes
  it changed. A restyle that renames a class must not be able to turn a replacement into
  a silent no-op; that has already happened once.
- The generator strips HTML comments from generated pages, and scans a comment-stripped
  copy of the template. Documentation examples like `data-event-key="..."` inside a
  comment otherwise read as real markup.
- Per-guest photos crop to a square via `object-fit: cover`, so any aspect ratio is safe.
- Each event is `<li data-event-key="...">`; drop the ones not in `events_invited`. The
  address and dress code sit inside a `<details>` so the page stays scannable and the
  disclosure still works with JS off.
- The hero photo, story, and the two bios carry no fields. That copy is identical on
  every invite and is edited in the template once. Only the second photo is per guest.
- The RSVP form posts `{ token, attending, events[], note }`. The token comes from the
  hidden field, never from a typed name.
- Guest pages must stay `noindex,nofollow`, out of `sitemap.xml`, and unlinked from
  anywhere on the site.

### Google Sheet, in and out

The sheet is the source of truth for guests. Two separate pieces connect to it, and
neither needs any third-party Python package.

**Reading it** - `tools/invite/fetch_guests.py` authenticates as a service account and
writes `tools/invite/guests.csv`. The RS256 JWT is signed by shelling out to `openssl`,
which is why there is no venv or `requirements.txt`. Scope is
`spreadsheets.readonly`, so the script cannot damage the sheet.

One-time setup:

1. In the Google Cloud console, make a project and enable the **Google Sheets API**.
2. Create a **service account**, then under its Keys tab add a JSON key.
3. Save that file as `tools/invite/service-account.json` and `chmod 600` it. It is
   gitignored, along with `*.pem` and `*-service-account.json`.
4. Open the key file, copy the `client_email` (it ends in
   `.iam.gserviceaccount.com`), and **share the sheet with that address** as Viewer.
   This is the step people miss; without it the API returns 403 or 404 even though the
   credentials are valid.

```
python3 tools/invite/fetch_guests.py --sheet <spreadsheet-id> --dry-run
python3 tools/invite/fetch_guests.py --sheet <spreadsheet-id> --range 'Guests!A:Z'
```

Sheet headers are matched loosely, so `Guest Name`, `guest_name` and `guestname` all
work; see `ALIASES` in the script for accepted spellings. Only a name column is
required. Rows with no name are skipped.

A token is a live URL as soon as it is sent to someone, so a blank token cell in the
sheet never wipes one that already exists locally: `fetch_guests.py` carries over any
token already in `guests.csv`, matching on name, and says which ones it kept. Two
guests sharing a token is a hard error, because they would share an invite page. Paste
tokens back into the sheet once links go out, so the sheet stays authoritative.

**Writing to it** - `tools/invite/rsvp.gs` goes in the sheet's own Apps Script project
(Extensions > Apps Script), deployed as a web app with *Execute as: Me* and *Who has
access: Anyone*. "Anyone" is unavoidable since guests are not signed into Google; it
exposes only this script, which never reads anything back to the caller. Put the `/exec`
URL in `RSVP_ENDPOINT` in `assets/js/invite.js`.

Three constraints worth knowing before touching either side:

- Apps Script has no `doOptions` and cannot set CORS headers, so only "simple" requests
  work. The client posts a JSON string as `text/plain` and the script parses
  `e.postData.contents`. Posting `application/json` triggers a preflight and fails with
  405. `doOptions` and `setHeaders` suggestions found online do not work.
- **Edit the existing deployment when redeploying.** A new deployment gets a new `/exec`
  URL, which silently breaks every invite already sent.
- `RSVP_ENDPOINT` ships in public JavaScript, so anyone can find it and POST. An unknown
  token is the only gate: the script rejects any token not in the sheet before writing,
  caps the note length, and ignores malformed event keys. It takes a script lock so two
  simultaneous RSVPs cannot overwrite each other.

A failed cross-origin read is indistinguishable from a dropped connection, and in both
cases the row may already be stored. So the form says it could not confirm the save and
asks the guest to text rather than resubmit, instead of claiming a failure that would
invite a duplicate.

Remaining steps: confirm the three Hyderabad venues; set up the service account and
share the sheet; deploy the Apps Script and fill in `RSVP_ENDPOINT`; batch-generate,
spot-check, send.
