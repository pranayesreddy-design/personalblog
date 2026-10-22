#!/usr/bin/env python3
"""Rename guest photos from names to tokens.

    python3 tools/invite/rename_photos.py ~/Desktop/guest-photos --dry-run
    python3 tools/invite/rename_photos.py ~/Desktop/guest-photos

The generator looks for assets/images/invite/<token>.jpg, but a token is random,
so a folder of rc66pchc.jpg is impossible to curate by hand. Name the files
after the guest instead - "Kishan.jpg", "Sai Teja.jpeg" - and this maps them
through guests.csv.

Nine first names repeat in the list. For those, put the serial number in the
filename, either "20 Ajay.jpg" or "Ajay-20.jpg"; an ambiguous name is reported
rather than assigned, because the wrong photo on a page is worse than none.

Originals are copied, never moved, so the folder you curate stays intact.
"""

import argparse
import csv
import re
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
GUESTS = REPO / "tools" / "invite" / "guests.csv"
PHOTO_DIR = REPO / "assets" / "images" / "invite"

SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}

# Files the generator owns rather than guests: never treat these as a guest
# photo, and never overwrite them.
RESERVED = {"couple", "us-together", "k7m2qp4x"}


def normalise(text):
    return re.sub(r"[^a-z0-9]", "", (text or "").lower())


def parse_stem(stem):
    """Split a filename stem into (serial or None, name).

    Accepts "20 Ajay", "Ajay-20", "Ajay_20" and plain "Ajay".
    """
    stem = stem.strip()
    lead = re.match(r"^(\d{1,4})\s*[-_. ]\s*(.+)$", stem)
    if lead:
        return lead.group(1), lead.group(2).strip()
    trail = re.match(r"^(.+?)\s*[-_ ]\s*(\d{1,4})$", stem)
    if trail:
        return trail.group(2), trail.group(1).strip()
    return None, stem


def load_guests(path):
    if not path.exists():
        print("error: no %s. Pull the sheet first." % path, file=sys.stderr)
        return None
    with path.open(newline="", encoding="utf-8") as handle:
        rows = [r for r in csv.DictReader(handle) if (r.get("token") or "").strip()]
    if not rows:
        print("error: %s has no tokens. Run generate.py --tokens." % path, file=sys.stderr)
        return None
    return rows


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("folder", type=Path, help="folder of photos named after guests")
    parser.add_argument("--guests", type=Path, default=GUESTS)
    parser.add_argument("--into", type=Path, default=PHOTO_DIR)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--replace",
        action="store_true",
        help="overwrite a photo already in place for that guest",
    )
    args = parser.parse_args(argv)

    if not args.folder.is_dir():
        print("error: %s is not a folder" % args.folder, file=sys.stderr)
        return 1

    rows = load_guests(args.guests)
    if rows is None:
        return 1

    by_name = {}
    by_serial = {}
    for row in rows:
        by_name.setdefault(normalise(row["name"]), []).append(row)
        serial = (row.get("sno") or "").strip()
        if serial:
            by_serial[serial] = row

    files = sorted(
        p for p in args.folder.iterdir()
        if p.is_file() and p.suffix.lower() in SUFFIXES
    )
    print("%d image file(s) in %s" % (len(files), args.folder))

    planned, problems = [], []
    for path in files:
        if normalise(path.stem) in {normalise(r) for r in RESERVED}:
            problems.append((path.name, "reserved filename, skipped"))
            continue

        serial, name = parse_stem(path.stem)
        matches = by_name.get(normalise(name), [])

        if serial and serial in by_serial:
            row = by_serial[serial]
            if matches and row not in matches:
                problems.append(
                    (path.name, "serial %s is %r, not %r" % (serial, row["name"], name))
                )
                continue
        elif len(matches) == 1:
            row = matches[0]
        elif not matches:
            problems.append((path.name, "no guest called %r" % name))
            continue
        else:
            problems.append((
                path.name,
                "%d guests called %r (S.No %s); add the serial to the filename"
                % (len(matches), name, ", ".join(m.get("sno", "?") for m in matches)),
            ))
            continue

        target = args.into / (row["token"] + path.suffix.lower())
        if target.exists() and not args.replace:
            problems.append((path.name, "%s already has a photo; pass --replace" % row["name"]))
            continue
        planned.append((path, target, row["name"], row["token"]))

    # Keyed on the token, not the filename. Two files for one guest with
    # different extensions land on different filenames but the same person, and
    # the generator would quietly pick whichever suffix it checks first.
    seen = {}
    for src, target, name, token in planned:
        seen.setdefault(token, []).append((src.name, name))
    for token, sources in seen.items():
        if len(sources) > 1:
            problems.append((
                ", ".join(s for s, _ in sources),
                "all belong to %s; keep one" % sources[0][1],
            ))
    planned = [p for p in planned if len(seen[p[3]]) == 1]

    print("%d photo(s) ready to place" % len(planned))
    for src, target, name, _ in planned[:10]:
        print("   %-28s -> %-16s (%s)" % (src.name, target.name, name))
    if len(planned) > 10:
        print("   ... and %d more" % (len(planned) - 10))

    if problems:
        print("\n%d file(s) need attention:" % len(problems))
        for name, why in problems:
            print("   %-28s %s" % (name[:28], why))

    if args.dry_run:
        print("\ndry run, nothing copied")
        return 0

    for src, target, _, _token in planned:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, target)
    print("\ncopied %d photo(s) into %s" % (len(planned), args.into))

    have = sum(
        1 for row in rows
        if any((args.into / (row["token"] + s)).exists() for s in SUFFIXES)
    )
    print("%d of %d guests now have their own photo" % (have, len(rows)))
    print("The rest fall back to the photo of the two of you.")
    print("\nThis repo is public, so these photos will be visible to anyone who")
    print("browses it once committed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
