#!/usr/bin/env python3
"""Generate one invite page per guest from a CSV.

    python3 tools/invite/generate.py --tokens   guests.csv
    python3 tools/invite/generate.py --guests   guests.csv --out dist

Columns (one row per person):

    token, name, photo_url, events_invited, rsvp_status, responded_at, and an
    optional caption

`events_invited` holds event keys separated by spaces, pipes, or commas, and
must match the data-event-key values in the template.

`household_id` is accepted but unused: the page no longer names the other
people in a household, so it only matters if you later want to group RSVPs.

Output is a standalone directory, dist/ by default:

    dist/i/<token>/index.html
    dist/assets/...

Nothing is templated by position or by CSS class. Every edit is anchored to a
data-* attribute and asserts how many nodes it changed, so a future restyle
that renames a class cannot silently turn a replacement into a no-op.

The couple's names, the date, the story, and the bios are identical on every
invite and are deliberately NOT touched here. Edit those in the template.
"""

import argparse
import csv
import html
import re
import secrets
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
# Deliberately not under i/, because everything in this repo is served by
# GitHub Pages and i/preview/ would be a guessable live URL showing the whole
# invite. This path sits at the same depth as i/<token>/, so the template's
# relative ../../assets/ links keep resolving once a page is rendered.
TEMPLATE = REPO / "tools" / "invite" / "template.html"
PHOTO_DIR = REPO / "assets" / "images" / "invite"

# Copied into the output so dist/ can be deployed on its own. The paths the
# template uses are relative to i/<token>/, so the layout must be preserved.
ASSETS = [
    Path("assets/css/invite.css"),
    Path("assets/js/invite.js"),
    Path("assets/images/favicon-astronaut.png"),
]

# Same on every invite, so the generator leaves them exactly as authored.
SHARED_FIELDS = {"couple", "date"}

# Values that only exist in the preview. If one reaches a generated page it means
# a substitution silently missed, which is worse than failing the row.
PREVIEW_PLACEHOLDERS = ["Ravi", "k7m2qp4x"]

# No 0/O/1/l/I, so a token read aloud or retyped from a screenshot survives.
TOKEN_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
TOKEN_LENGTH = 8
TOKEN_RE = re.compile(r"^[a-z0-9]{6,12}$")


COMMENT_RE = re.compile(r"<!--.*?-->", re.S)
BLANK_RUN_RE = re.compile(r"\n{3,}")


class GenerateError(Exception):
    pass


def strip_comments(page):
    """Comments document the template for us, not for the guest, and they also
    name the fields and event keys. Scanning them as if they were markup is how
    a doc example like data-event-key="..." becomes a phantom event."""
    return BLANK_RUN_RE.sub("\n\n", COMMENT_RE.sub("", page))


def make_token():
    return "".join(secrets.choice(TOKEN_ALPHABET) for _ in range(TOKEN_LENGTH))


def split_keys(raw):
    return [k for k in re.split(r"[\s,|]+", (raw or "").strip()) if k]


def set_field(page, field, inner_html):
    """Replace the inner HTML of the element marked with this field."""
    pattern = re.compile(
        r'(<(?P<tag>[a-zA-Z][a-zA-Z0-9]*)(?=[\s>])[^>]*data-invite-field="%s"[^>]*>)'
        r"(.*?)"
        r"(</(?P=tag)>)" % re.escape(field),
        re.S,
    )
    page, count = pattern.subn(lambda m: m.group(1) + inner_html + m.group(4), page, count=1)
    if count != 1:
        raise GenerateError("field %r: expected 1 element, changed %d" % (field, count))
    return page


def set_photo(page, field, src, alt):
    """Point a void <img> at a new file. Attributes, not inner HTML."""
    pattern = re.compile(r'<img\b[^>]*data-invite-field="%s"[^>]*>' % re.escape(field), re.S)
    match = pattern.search(page)
    if not match:
        raise GenerateError("photo field %r not found" % field)

    tag = match.group(0)
    for attr, value in (("src", src), ("alt", alt)):
        tag, count = re.subn(
            r'(\b%s=")[^"]*(")' % attr,
            lambda m: m.group(1) + value + m.group(2),
            tag,
            count=1,
        )
        if count != 1:
            raise GenerateError("photo field %r: no %s attribute" % (field, attr))

    return page[: match.start()] + tag + page[match.end() :]


def drop_block(page, name):
    """Remove an optional region marked data-invite-block."""
    pattern = re.compile(
        r'[ \t]*<(?P<tag>[a-zA-Z][a-zA-Z0-9]*)(?=[\s>])[^>]*data-invite-block="%s"[^>]*>'
        r".*?</(?P=tag)>[ \t]*\n" % re.escape(name),
        re.S,
    )
    page, count = pattern.subn("", page, count=1)
    if count != 1:
        raise GenerateError("block %r: expected 1 region, removed %d" % (name, count))
    return page


def drop_event(page, key):
    pattern = re.compile(
        r'[ \t]*<li\b[^>]*data-event-key="%s"[^>]*>.*?</li>[ \t]*\n' % re.escape(key), re.S
    )
    page, count = pattern.subn("", page, count=1)
    if count != 1:
        raise GenerateError("event %r: expected 1 entry, removed %d" % (key, count))
    return page


LABEL_RE = re.compile(r"[ \t]*<label\b.*?</label>[ \t]*\n", re.S)


def drop_event_checkbox(page, key):
    removed = 0

    def repl(match):
        nonlocal removed
        block = match.group(0)
        if 'name="events"' in block and ('value="%s"' % key) in block:
            removed += 1
            return ""
        return block

    page = LABEL_RE.sub(repl, page)
    if removed != 1:
        raise GenerateError("event %r: expected 1 checkbox, removed %d" % (key, removed))
    return page


def set_attribute(page, selector_attr, attr, value):
    """Set an attribute on the single element carrying a marker attribute."""
    pattern = re.compile(r"<[a-zA-Z][a-zA-Z0-9]*\b[^>]*\b%s\b[^>]*>" % re.escape(selector_attr))
    match = pattern.search(page)
    if not match:
        raise GenerateError("no element carrying %r" % selector_attr)

    tag, count = re.subn(
        r'(\b%s=")[^"]*(")' % re.escape(attr),
        lambda m: m.group(1) + value + m.group(2),
        match.group(0),
        count=1,
    )
    if count != 1:
        raise GenerateError("element %r has no %s attribute" % (selector_attr, attr))

    return page[: match.start()] + tag + page[match.end() :]


def photo_for(row):
    """The per-guest photo, or None. Named by token so it cannot be mismatched."""
    explicit = (row.get("photo_url") or "").strip()
    if explicit:
        return explicit
    for suffix in (".jpg", ".jpeg", ".png", ".webp"):
        if (PHOTO_DIR / (row["token"] + suffix)).exists():
            return "../../assets/images/invite/" + row["token"] + suffix
    return None


def render(template, row, template_fields, template_events):
    token = row["token"]
    name = (row.get("name") or "").strip()
    if not name:
        raise GenerateError("row has no name")

    invited = split_keys(row.get("events_invited"))
    if not invited:
        raise GenerateError("no events_invited")
    unknown = [k for k in invited if k not in template_events]
    if unknown:
        raise GenerateError("unknown event keys %s (template has %s)" % (unknown, sorted(template_events)))

    page = template
    page = set_field(page, "name", html.escape(name))
    page = set_field(page, "token", html.escape(token))
    page = set_attribute(page, "data-token", "data-token", html.escape(token))
    page = set_attribute(page, "data-rsvp-token", "value", html.escape(token))
    handled = {"name", "token"}

    photo = photo_for(row)
    if photo:
        page = set_photo(page, "guestPhoto", html.escape(photo),
                         html.escape("%s with Pranay and Shruti" % name))
        caption = (row.get("caption") or "").strip()
        if caption:
            page = set_field(page, "caption", html.escape(caption))
    else:
        page = drop_block(page, "personal-photo")
    handled |= {"guestPhoto", "caption"}

    for key in sorted(template_events - set(invited)):
        page = drop_event(page, key)
        page = drop_event_checkbox(page, key)

    # The attributes survive substitution, so completeness cannot be checked by
    # looking for them. Compare what the template asks for against what was
    # either filled in or deliberately dropped.
    missed = template_fields - SHARED_FIELDS - handled
    if missed:
        raise GenerateError("template field(s) %s not handled by this script" % sorted(missed))

    stale = [
        value
        for value in PREVIEW_PLACEHOLDERS
        if value in page and value not in (name, token)
    ]
    if stale:
        raise GenerateError("preview placeholder(s) %s survived" % stale)

    return page


def read_guests(path):
    with open(path, newline="", encoding="utf-8") as handle:
        rows = [r for r in csv.DictReader(handle) if any((v or "").strip() for v in r.values())]
    if not rows:
        raise SystemExit("no guest rows in %s" % path)
    return rows


def cmd_tokens(path):
    rows = read_guests(path)
    fields = list(rows[0].keys())
    if "token" not in fields:
        raise SystemExit("no token column in %s" % path)

    existing = {(r.get("token") or "").strip() for r in rows if (r.get("token") or "").strip()}
    added = 0
    for row in rows:
        if (row.get("token") or "").strip():
            continue
        token = make_token()
        while token in existing:
            token = make_token()
        existing.add(token)
        row["token"] = token
        added += 1

    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    print("filled %d token(s); %d row(s) total" % (added, len(rows)))


def cmd_generate(guests_path, out_dir, limit):
    template = strip_comments(TEMPLATE.read_text(encoding="utf-8"))
    template_events = set(re.findall(r'data-event-key="([^"]+)"', template))
    if not template_events:
        raise SystemExit("template declares no data-event-key entries")
    template_fields = set(re.findall(r'data-invite-field="(\w+)"', template))

    rows = read_guests(guests_path)

    seen = {}
    for index, row in enumerate(rows, start=2):
        token = (row.get("token") or "").strip()
        if not token:
            raise SystemExit("row %d has no token; run --tokens first" % index)
        if not TOKEN_RE.match(token):
            raise SystemExit("row %d: token %r is not 6-12 lowercase alphanumerics" % (index, token))
        if token in seen:
            raise SystemExit("row %d: token %r already used on row %d" % (index, token, seen[token]))
        seen[token] = index
        row["token"] = token

    if limit:
        rows = rows[:limit]

    out = Path(out_dir)
    if out.exists():
        shutil.rmtree(out)
    for asset in ASSETS:
        target = out / asset
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(REPO / asset, target)
    if PHOTO_DIR.exists():
        shutil.copytree(PHOTO_DIR, out / "assets" / "images" / "invite", dirs_exist_ok=True)

    failures = []
    written = 0
    for row in rows:
        try:
            page = render(template, row, template_fields, template_events)
        except GenerateError as error:
            failures.append("%s (%s): %s" % (row["token"], row.get("name") or "?", error))
            continue

        page_dir = out / "i" / row["token"]
        page_dir.mkdir(parents=True, exist_ok=True)
        (page_dir / "index.html").write_text(page, encoding="utf-8")
        written += 1

    print("wrote %d page(s) to %s/i/<token>/index.html" % (written, out))
    if failures:
        print("\n%d row(s) failed:" % len(failures), file=sys.stderr)
        for line in failures:
            print("  " + line, file=sys.stderr)
        return 1

    print(
        "\nReminder: this repo is public. Do not commit %s -- it contains every\n"
        "token, name, and photo. Deploy it from a private repo instead." % out
    )
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--guests", help="guest CSV to render")
    parser.add_argument("--tokens", metavar="CSV", help="fill blank tokens in this CSV, in place")
    parser.add_argument("--out", default="dist", help="output directory (default: dist)")
    parser.add_argument("--limit", type=int, default=0, help="render only the first N rows")
    args = parser.parse_args()

    if args.tokens:
        cmd_tokens(args.tokens)
        return 0
    if not args.guests:
        parser.error("pass --guests CSV or --tokens CSV")
    return cmd_generate(args.guests, args.out, args.limit)


if __name__ == "__main__":
    sys.exit(main())
