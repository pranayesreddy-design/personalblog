#!/usr/bin/env python3
"""Build one WhatsApp click-to-chat link per guest.

    python3 tools/invite/send_links.py --out /tmp/send.html

Opens as a page of links. Clicking one opens WhatsApp with the message already
typed, addressed to that guest; you still press send. That is the only way to
send from a personal number: WhatsApp exposes no scripting interface, and
bulk-sending through the Cloud API needs a business account and an approved
template.

Sending by hand is also the safety net. Every link is unique to one guest, so a
message sent to the wrong person hands over someone else's invite. One glance
per message is worth it.
"""

import argparse
import csv
import html
import re
import sys
import urllib.parse
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
GUESTS = REPO / "tools" / "invite" / "guests.csv"
BASE = "https://krishnapranay.com/i/%s/"

# Warm and short. The invite page carries the detail, so this only has to say
# who it is from and why the link is worth opening.
MESSAGE = (
    "Hi {name}! Shruti and I are getting married in February, and we have made "
    "you your own invite page with all the details: {link}\n\n"
    "It has the full schedule and a place to RSVP. Would love to have you there."
)


def clean_number(raw):
    """A phone number as WhatsApp wants it: digits only, country code included.

    Indian mobiles are stored locally as ten digits, so they need the 91 that
    is implied. Anything already carrying a country code is left alone.
    """
    digits = re.sub(r"\D", "", raw or "")
    if not digits:
        return ""
    if raw.strip().startswith("+"):
        return digits
    if len(digits) == 10:
        return "91" + digits
    if len(digits) == 11 and digits.startswith("0"):
        return "91" + digits[1:]
    if len(digits) == 12 and digits.startswith("91"):
        return digits
    return digits


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--guests", type=Path, default=GUESTS)
    parser.add_argument("--out", type=Path, required=True, help="HTML file to write")
    parser.add_argument(
        "--event",
        default="",
        help="only guests invited to this event key",
    )
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args(argv)

    if not args.guests.exists():
        print("error: no %s" % args.guests, file=sys.stderr)
        return 1

    with args.guests.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))

    ready, no_phone, no_token, not_invited = [], [], [], []
    for row in rows:
        name = (row.get("name") or "").strip()
        token = (row.get("token") or "").strip()
        phone = clean_number(row.get("phone"))
        events = (row.get("events_invited") or "").split()

        if not events:
            not_invited.append(name)
            continue
        if args.event and args.event not in events:
            continue
        if not token:
            no_token.append(name)
            continue
        if not phone:
            no_phone.append(name)
            continue
        ready.append(
            {
                "name": name,
                "phone": phone,
                "token": token,
                "link": BASE % token,
                "events": events,
                "party": (row.get("party_size") or "").strip(),
            }
        )

    if args.limit:
        ready = ready[: args.limit]

    print("%d guest(s) ready to message" % len(ready))
    for label, names in (
        ("no phone number yet", no_phone),
        ("no token", no_token),
        ("invited to nothing", not_invited),
    ):
        if names:
            print(
                "  skipped, %-20s %3d: %s%s"
                % (label, len(names), ", ".join(names[:5]), "..." if len(names) > 5 else "")
            )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(render(ready), encoding="utf-8")
    print("\nwrote %s" % args.out)
    print("Open it, then work down the list. Each link opens WhatsApp with the")
    print("message typed; you press send. Tick them off as you go.")
    return 0


def render(ready):
    parts = [
        "<!doctype html>",
        '<html lang="en"><head><meta charset="utf-8">',
        "<title>Send invites</title>",
        "<style>",
        "body{font:16px/1.5 system-ui,sans-serif;max-width:46rem;margin:2rem auto;"
        "padding:0 1rem;color:#222}",
        "h1{font-size:1.4rem}",
        "p.note{color:#666}",
        "ol{padding-left:1.6rem}",
        "li{margin:0 0 .9rem;padding:.2rem 0}",
        "li.done{opacity:.35}",
        "a.send{display:inline-block;background:#25d366;color:#fff;text-decoration:none;"
        "padding:.3rem .8rem;border-radius:.3rem;font-weight:600}",
        "a.page{color:#666;font-size:.85rem;margin-left:.5rem}",
        "span.meta{color:#888;font-size:.85rem}",
        "input{margin-right:.5rem}",
        "</style></head><body>",
        "<h1>Send invites</h1>",
        '<p class="note">%d guests. Each button opens WhatsApp with the message '
        "already typed, addressed to that person. Check the name in WhatsApp "
        "matches the name here before sending: every link is unique to one "
        "guest.</p>" % len(ready),
        "<ol>",
    ]
    for item in ready:
        text = MESSAGE.format(name=item["name"], link=item["link"])
        href = "https://wa.me/%s?text=%s" % (
            item["phone"],
            urllib.parse.quote(text),
        )
        meta = "+%s &middot; %s" % (item["phone"], ", ".join(item["events"]))
        if item["party"] and item["party"] != "1":
            meta += " &middot; party of %s" % item["party"]
        parts.append(
            '<li><input type="checkbox" onchange="this.closest(\'li\').classList'
            ".toggle('done',this.checked)\">"
            '<strong>%s</strong> <span class="meta">%s</span><br>'
            '<a class="send" href="%s" target="_blank" rel="noopener">WhatsApp</a>'
            '<a class="page" href="%s" target="_blank" rel="noopener">preview page</a>'
            "</li>"
            % (html.escape(item["name"]), meta, html.escape(href), html.escape(item["link"]))
        )
    parts.append("</ol></body></html>")
    return "\n".join(parts)


if __name__ == "__main__":
    sys.exit(main())
