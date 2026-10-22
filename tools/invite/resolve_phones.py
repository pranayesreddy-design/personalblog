#!/usr/bin/env python3
"""Turn the phone-match review workbook into one number per guest.

    python3 tools/invite/resolve_phones.py Phone_Match_Review.xlsx

The workbook pairs each guest against the contacts whose name could plausibly
be theirs, and the last column holds a decision. Those decisions are mostly
hints rather than numbers - "BG", "Tenstorrent", "Amazon" - naming which of the
candidates is the right one. This resolves each hint against the candidate
labels and reports anything it cannot settle on its own.

Nothing is guessed. A hint matching two contacts, or none, is reported rather
than resolved, because sending an invite to the wrong number is worse than
sending none.

Reads .xlsx with the standard library only: it is a zip of XML, and openpyxl is
not installed.
"""

import argparse
import csv
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

# Decisions that mean "do not contact this person", rather than naming someone.
DROP = {"n", "no", "na", "naremovefromthelist", "remove", "drop", "skip"}
# Decisions that mean "not yet", which is a real answer but not a number.
LATER = {"nagetnumberlater", "comebacktothislater", "later", "tbd", "shouldbethere"}
# Decisions that mean "yes, the single candidate you found is right".
ACCEPT = {"y", "yes", "yy", "yep", "correct", "ok"}

# Words that qualify a hint rather than name a contact. "Just Sai Teja" means
# the contact called plainly "Sai Teja", not the one with a suffix.
FILLER = {"just", "the", "only", "plain", "use", "number", "no"}

OUT_FIELDS = [
    "sheet_row",
    "name",
    "outcome",
    "phone",
    "contact_label",
    "decision",
    "detail",
]


class Failure(Exception):
    pass


def normalise(text):
    return re.sub(r"[^a-z0-9]", "", (text or "").lower())


def read_xlsx(path):
    """Every row of the first worksheet, as lists of strings."""
    try:
        book = zipfile.ZipFile(path)
    except (OSError, zipfile.BadZipFile) as exc:
        raise Failure("could not open %s: %s" % (path, exc))

    shared = []
    if "xl/sharedStrings.xml" in book.namelist():
        root = ET.fromstring(book.read("xl/sharedStrings.xml"))
        for item in root.findall(NS + "si"):
            shared.append("".join(t.text or "" for t in item.iter(NS + "t")))

    names = [n for n in book.namelist() if n.startswith("xl/worksheets/sheet")]
    if not names:
        raise Failure("%s has no worksheets" % path)
    root = ET.fromstring(book.read(sorted(names)[0]))

    rows = []
    for row in root.iter(NS + "row"):
        cells = {}
        for cell in row.findall(NS + "c"):
            value = cell.find(NS + "v")
            inline = cell.find(NS + "is")
            if cell.get("t") == "s" and value is not None:
                text = shared[int(value.text)]
            elif inline is not None:
                text = "".join(t.text or "" for t in inline.iter(NS + "t"))
            else:
                text = value.text if value is not None else ""
            cells[column_index(cell.get("r"))] = (text or "").strip()
        rows.append([cells.get(i, "") for i in range(max(cells) + 1 if cells else 0)])
    return rows


def column_index(ref):
    letters = re.match(r"([A-Z]+)", ref or "A").group(1)
    number = 0
    for char in letters:
        number = number * 26 + (ord(char) - 64)
    return number - 1


def parse_candidates(text):
    """Split "Label: num, num | Other: num" into [(label, [numbers])]."""
    found = []
    for chunk in (text or "").split("|"):
        chunk = chunk.strip()
        if not chunk or ":" not in chunk:
            continue
        label, _, numbers = chunk.rpartition(":")
        digits = [n.strip() for n in numbers.split(",") if n.strip()]
        digits = [n for n in digits if re.search(r"\d", n)]
        if label.strip() and digits:
            found.append((label.strip(), digits))
    return found


def last_ten(number):
    """Compare numbers by their last ten digits, so +91 and bare agree."""
    digits = re.sub(r"\D", "", number or "")
    return digits[-10:] if len(digits) >= 10 else digits


def looks_like_number(text):
    digits = re.sub(r"\D", "", text or "")
    return len(digits) >= 10 and re.fullmatch(r"[+0-9 ()\-.]+", text.strip() or "x")


def match_hint(hint, candidates):
    """Candidates whose label contains every word of the hint."""
    words = [normalise(w) for w in re.split(r"[\s,]+", hint) if normalise(w)]
    if not words:
        return []
    return [
        (label, numbers)
        for label, numbers in candidates
        if all(word in normalise(label) for word in words)
    ]


def strip_filler(hint):
    words = [w for w in re.split(r"[\s,]+", hint or "") if w]
    kept = [w for w in words if normalise(w) not in FILLER]
    return " ".join(kept) if kept else (hint or "")


def one_edit_apart(a, b):
    """True if a and b differ by a single insert, delete or substitution.

    Only used to forgive an obvious typo in a hint, like "bhargv" for the
    contact "Bhargav". Length is capped so short strings cannot collide.
    """
    if abs(len(a) - len(b)) > 1 or min(len(a), len(b)) < 4:
        return False
    if a == b:
        return False
    if len(a) == len(b):
        return sum(1 for x, y in zip(a, b) if x != y) == 1
    shorter, longer = (a, b) if len(a) < len(b) else (b, a)
    for i in range(len(longer)):
        if longer[:i] + longer[i + 1:] == shorter:
            return True
    return False


def all_numbers(candidates):
    """Every (label, number) pair across the candidates, in order."""
    pairs = []
    for label, numbers in candidates:
        for number in numbers:
            pairs.append((label, number))
    return pairs


def match_by_digits(hint, candidates):
    """A bare run of digits names the number ending in them.

    The review sheet uses the last few digits to pick between two numbers on
    the same contact, e.g. "430" for 8688200430.
    """
    digits = re.sub(r"\D", "", hint)
    if not digits or not re.fullmatch(r"\d{2,7}", hint.strip()):
        return []
    return [
        (label, [number])
        for label, number in all_numbers(candidates)
        if re.sub(r"\D", "", number).endswith(digits)
    ]


def match_by_prefix(hint, candidates):
    """A hint like "+12..." names the number starting with that country code."""
    prefix = re.match(r"\+(\d+)", hint.strip())
    if not prefix:
        return []
    wanted = prefix.group(1)
    return [
        (label, [number])
        for label, number in all_numbers(candidates)
        if number.strip().startswith("+" + wanted)
    ]


def read_contacts(path):
    """Every vCard as (full name, [numbers])."""
    if not path or not path.exists():
        return []
    text = path.read_text(encoding="utf-8", errors="replace")
    cards = []
    for block in text.split("END:VCARD"):
        if "BEGIN:VCARD" not in block:
            continue
        name = ""
        numbers = []
        for line in block.splitlines():
            if line.startswith("FN:"):
                name = line[3:].strip()
            elif line.startswith("TEL"):
                _, _, value = line.partition(":")
                value = value.strip()
                if re.search(r"\d", value):
                    numbers.append(value)
        if name and numbers:
            cards.append((name, numbers))
    return cards


def match_contacts(hint, contacts):
    """Contacts whose name contains every word of the hint."""
    words = [normalise(w) for w in re.split(r"[\s,?]+", hint) if normalise(w)]
    if not words:
        return []
    hits = [
        (name, numbers)
        for name, numbers in contacts
        if all(word in normalise(name) for word in words)
    ]
    # Prefer an exact name match if the hint is itself a full contact name.
    exact = [c for c in hits if normalise(c[0]) == normalise(hint)]
    return exact or hits


def resolve(row, contacts=()):
    """One review row to an outcome dict. Never guesses."""
    sheet_row = row[0] if len(row) > 0 else ""
    name = row[1] if len(row) > 1 else ""
    status = row[2] if len(row) > 2 else ""
    candidates = parse_candidates(row[3] if len(row) > 3 else "")
    decision = (row[4] if len(row) > 4 else "").strip()

    result = {
        "sheet_row": sheet_row,
        "name": name,
        "outcome": "",
        "phone": "",
        "contact_label": "",
        "decision": decision,
        "detail": "",
    }

    def settle(outcome, label="", numbers=(), detail=""):
        result["outcome"] = outcome
        result["contact_label"] = label
        result["detail"] = detail
        if numbers:
            result["phone"] = numbers[0]
            if len(numbers) > 1:
                result["detail"] = (
                    detail + "; " if detail else ""
                ) + "contact has %d numbers, took the first: %s" % (
                    len(numbers),
                    ", ".join(numbers),
                )
        return result

    key = normalise(decision)

    if not decision:
        if not candidates:
            return settle("no contact", detail=status or "no contact found")
        return settle("undecided", detail="%d candidate(s), no decision" % len(candidates))

    if key in DROP:
        return settle("excluded", detail="marked as not to be contacted")

    if key in LATER:
        return settle("deferred", detail="number to be found later")

    if looks_like_number(decision):
        return settle("resolved", label="given directly", numbers=[decision.strip()])

    if key in ACCEPT:
        if len(candidates) == 1:
            return settle("resolved", candidates[0][0], candidates[0][1])
        if not candidates:
            return settle("conflict", detail="accepted, but no candidate to accept")
        return settle(
            "ambiguous",
            detail="accepted, but %d candidates fit: %s"
            % (len(candidates), " | ".join(label for label, _ in candidates)),
        )

    # A bare run of digits, or a country code, picks between the numbers on a
    # contact rather than between contacts.
    for finder, why in ((match_by_digits, "last digits"), (match_by_prefix, "country code")):
        hits = finder(decision, candidates)
        if len(hits) == 1:
            return settle("resolved", hits[0][0], hits[0][1], "matched %s %r" % (why, decision))
        if len(hits) > 1:
            return settle(
                "ambiguous",
                detail="%s %r fits %d numbers" % (why, decision, len(hits)),
            )

    # Otherwise the hint names which contact is the right one. Try the precise
    # readings before the loose one, so "BG" against "Mohit BG" and "Mohit BG1"
    # settles on the exact label rather than giving up as ambiguous.
    hint = strip_filler(decision)
    key = normalise(hint)
    name_key = normalise(name) + key

    attempts = (
        ("exact contact name", [c for c in candidates if normalise(c[0]) == key]),
        ("guest name plus hint", [c for c in candidates if normalise(c[0]) == name_key]),
        ("contained in one contact", match_hint(hint, candidates)),
        ("one typo away", [c for c in candidates if one_edit_apart(normalise(c[0]), key)]),
    )
    for why, hits in attempts:
        if len(hits) == 1:
            return settle("resolved", hits[0][0], hits[0][1], "matched %s" % why)

    # The candidate list is built from guesses at the guest's name, so a hint
    # naming a contact filed under something else finds nothing. Search the
    # address book itself before giving up.
    #
    # Narrowed by the guest's name first, because many hints are a workplace
    # rather than a name: "Amazon" alone matches thirteen people. The hint on
    # its own is still tried after, since a hint like "Prudhvi Tenstorrent"
    # spells the contact's name and need not contain the guest's.
    narrowed = match_contacts(name + " " + hint, contacts)
    if len(narrowed) == 1:
        return settle(
            "resolved", narrowed[0][0], narrowed[0][1], "found in contacts by name and hint"
        )

    # Then the first name only. A surname in the guest list is often absent
    # from the contact: "Kiran Pantam" with the hint "Amazon" is filed simply
    # as "Kiran Amazon". The hint carries most of the weight here, so this only
    # stands when exactly one contact fits.
    first = (name.split() or [""])[0]
    if first and normalise(first) != normalise(name):
        narrow_first = match_contacts(first + " " + hint, contacts)
        if len(narrow_first) == 1:
            return settle(
                "resolved",
                narrow_first[0][0],
                narrow_first[0][1],
                "found in contacts by first name and hint; worth a glance",
            )

    found = match_contacts(hint, contacts)
    if len(found) == 1:
        return settle(
            "resolved", found[0][0], found[0][1], "found in contacts, not in candidates"
        )

    if len(narrowed) > 1:
        return settle(
            "ambiguous",
            detail="%r fits %d contacts: %s"
            % (decision, len(narrowed), " | ".join(n for n, _ in narrowed[:4])),
        )

    loose = match_hint(hint, candidates)
    if len(loose) > 1:
        return settle(
            "ambiguous",
            detail="hint %r fits %d contacts: %s"
            % (decision, len(loose), " | ".join(label for label, _ in loose)),
        )
    if len(found) > 1:
        return settle(
            "ambiguous",
            detail="%r looks like a group rather than a name; %d contacts carry it"
            % (decision, len(found)),
        )
    return settle(
        "unmatched hint",
        detail="hint %r matches none of: %s"
        % (decision, " | ".join(label for label, _ in candidates) or "(no candidates)"),
    )


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("workbook", type=Path)
    parser.add_argument(
        "--contacts",
        type=Path,
        help="Contacts.vcf, searched when a hint names nobody in the candidate list",
    )
    parser.add_argument("--out", type=Path, help="write the full result as CSV")
    parser.add_argument(
        "--show",
        default="",
        help="print every row with this outcome (e.g. ambiguous, undecided)",
    )
    args = parser.parse_args(argv)

    rows = read_xlsx(args.workbook)
    if not rows:
        raise Failure("%s is empty" % args.workbook)

    contacts = read_contacts(args.contacts)
    if args.contacts:
        print("read %d contact(s) from %s" % (len(contacts), args.contacts.name))

    results = [
        resolve(row, contacts) for row in rows[1:] if any(str(c).strip() for c in row)
    ]

    order = [
        "resolved",
        "ambiguous",
        "unmatched hint",
        "undecided",
        "no contact",
        "deferred",
        "excluded",
        "conflict",
    ]
    counts = {}
    for item in results:
        counts[item["outcome"]] = counts.get(item["outcome"], 0) + 1

    print("%d review row(s)" % len(results))
    for outcome in order:
        if counts.get(outcome):
            print("  %-15s %4d" % (outcome, counts[outcome]))
    leftover = sorted(set(counts) - set(order))
    for outcome in leftover:
        print("  %-15s %4d" % (outcome, counts[outcome]))

    have = sum(1 for item in results if item["phone"])
    print("\n%d of %d guests now have a number" % (have, len(results)))

    # Two guests on one number is almost always one person listed twice, who
    # would otherwise be sent two different invite links.
    seen = {}
    for item in results:
        if item["phone"]:
            seen.setdefault(last_ten(item["phone"]), []).append(item)
    shared = {k: v for k, v in seen.items() if len(v) > 1}
    if shared:
        print(
            "\n%d number(s) belong to more than one row, so those are probably the\n"
            "same person twice. Each would get a separate invite link:" % len(shared)
        )
        for number, items in shared.items():
            print(
                "  %-12s %s"
                % (
                    number,
                    " | ".join(
                        "%s (sheet row %s)" % (i["name"], i["sheet_row"]) for i in items
                    ),
                )
            )

    if args.show:
        wanted = [i for i in results if i["outcome"] == args.show]
        print("\n%s (%d):" % (args.show, len(wanted)))
        for item in wanted:
            print(
                "  row %-5s %-20s %s"
                % (item["sheet_row"], item["name"], item["detail"])
            )

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        with args.out.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=OUT_FIELDS)
            writer.writeheader()
            writer.writerows(results)
        print("\nwrote %s" % args.out)
        print("This holds guest phone numbers. Keep it out of git.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Failure as error:
        print("error: %s" % error, file=sys.stderr)
        sys.exit(1)
