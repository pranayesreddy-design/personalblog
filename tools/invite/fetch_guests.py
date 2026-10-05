#!/usr/bin/env python3
"""Pull the guest list out of a Google Sheet into tools/invite/guests.csv.

Authenticates as a service account. No third-party packages: the RS256 JWT is
signed by shelling out to openssl, which ships with macOS, so this stays
consistent with the rest of the invite tooling and needs no venv.

    python3 tools/invite/fetch_guests.py --sheet <spreadsheet-id>
    python3 tools/invite/fetch_guests.py --sheet <id> --range 'Guests!A:Z'

Reads credentials from tools/invite/service-account.json by default. That file
is a private key: it is gitignored and must stay that way.

Scope is read-only on purpose. This script never writes to your sheet, so it
cannot damage the guest list.
"""

import argparse
import base64
import csv
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CREDENTIALS = REPO / "tools" / "invite" / "service-account.json"
OUT = REPO / "tools" / "invite" / "guests.csv"

TOKEN_URI = "https://oauth2.googleapis.com/token"
SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly"
JWT_BEARER = "urn:ietf:params:oauth:grant-type:jwt-bearer"

# The CSV columns the generator expects, in order. "sno" is carried along so a
# re-import can match a row to the token it already issued even when two guests
# share a first name; generate.py passes unknown columns through untouched.
COLUMNS = [
    "token",
    "name",
    "photo_url",
    "household_id",
    "events_invited",
    "caption",
    "rsvp_status",
    "responded_at",
    "sno",
]

# Accepted sheet header spellings for each column. Matched after lowercasing
# and stripping everything that is not a letter or a digit, so "Guest Name",
# "guest_name" and "guestname" all land in the same place.
ALIASES = {
    "token": ["token", "code", "invitetoken", "invitecode", "link"],
    "name": ["name", "guest", "guestname", "firstname", "invitee"],
    "photo_url": ["photourl", "photo", "photolink", "image", "imageurl", "pic"],
    "household_id": ["householdid", "household", "family", "familyid", "group"],
    "events_invited": [
        "eventsinvited",
        "events",
        "invitedevents",
        "functions",
        "invitedto",
    ],
    "caption": ["caption", "photocaption", "note"],
    "rsvp_status": ["rsvpstatus", "rsvp", "status", "attending"],
    "responded_at": ["respondedat", "responded", "repliedat", "timestamp"],
    "sno": ["sno", "srno", "serialno", "serial", "id", "no", "number"],
}

# A guest list is far easier to keep by hand as a grid with one column per
# event, so accept that shape too and fold it into events_invited. Keys on the
# right must match data-event-key in the template.
EVENT_COLUMNS = {
    "pellikoduku": "pellikoduku",
    "pellikuduku": "pellikoduku",
    "pellikurukku": "pellikoduku",
    "cocktail": "cocktail",
    "cocktailparty": "cocktail",
    "haldi": "haldimehendi",
    "mehendi": "haldimehendi",
    "mehndi": "haldimehendi",
    "haldimehendi": "haldimehendi",
    "haldimehndi": "haldimehendi",
    "wedding": "wedding",
    "marriage": "wedding",
    "themarriage": "wedding",
    "muhurtham": "wedding",
}

# What counts as "invited" in a grid cell. A 0 or a blank means not invited:
# erring the other way would invite someone to an event they were never meant
# to attend.
TRUTHY = {"1", "y", "yes", "true", "x", "✓", "✔", "yep", "1.0"}

# Only a name is genuinely required. Tokens are generated locally by
# generate.py --tokens, and every other column is optional per guest.
REQUIRED = ["name"]


class Failure(Exception):
    """Something the user needs to fix, reported without a traceback."""


def warn(message):
    # stdout is block buffered when piped but stderr never is, so a bare print
    # to stderr jumps ahead of the progress lines and arrives with no context.
    sys.stdout.flush()
    print("\nwarning: %s" % message, file=sys.stderr)
    sys.stderr.flush()


def normalise(header):
    return re.sub(r"[^a-z0-9]", "", (header or "").strip().lower())


def b64url(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=")


def load_credentials(path):
    if not path.exists():
        raise Failure(
            "no credentials at %s\n"
            "Create a service account, download its JSON key, and save it there.\n"
            "Setup steps are in RULEBOOK.md section 11." % path
        )

    mode = stat.S_IMODE(path.stat().st_mode)
    if mode & 0o077:
        # A private key readable by other accounts on the machine. Worth saying
        # out loud rather than silently using it.
        warn("%s is mode %o; tighten it with chmod 600" % (path, mode))

    try:
        creds = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise Failure("%s is not valid JSON: %s" % (path, exc))

    for key in ("client_email", "private_key"):
        if not creds.get(key):
            raise Failure(
                "%s has no %r. That looks like an OAuth client file rather than a\n"
                "service account key; re-download the key from the service account." % (path, key)
            )
    return creds


def sign_rs256(message, private_key_pem):
    """RSASSA-PKCS1-v1_5 over SHA-256, via openssl.

    The key is written to a private temp file because openssl will not read it
    from a pipe alongside the data being signed. It is created 0600 by
    mkstemp and removed in the finally block.
    """
    fd, key_path = tempfile.mkstemp(prefix="invite-sa-", suffix=".pem")
    try:
        with os.fdopen(fd, "w") as handle:
            handle.write(private_key_pem)
        try:
            done = subprocess.run(
                ["openssl", "dgst", "-sha256", "-sign", key_path],
                input=message,
                capture_output=True,
                check=True,
            )
        except FileNotFoundError:
            raise Failure("openssl not found on PATH; it is needed to sign the token request")
        except subprocess.CalledProcessError as exc:
            raise Failure(
                "openssl could not sign with this key: %s"
                % exc.stderr.decode("utf-8", "replace").strip()
            )
        return done.stdout
    finally:
        try:
            os.unlink(key_path)
        except OSError:
            pass


def access_token(creds):
    now = int(time.time())
    header = {"alg": "RS256", "typ": "JWT"}
    claims = {
        "iss": creds["client_email"],
        "scope": SCOPE,
        "aud": creds.get("token_uri") or TOKEN_URI,
        "iat": now,
        # Google rejects anything over an hour.
        "exp": now + 3600,
    }
    signing_input = b".".join(
        [
            b64url(json.dumps(header, separators=(",", ":")).encode()),
            b64url(json.dumps(claims, separators=(",", ":")).encode()),
        ]
    )
    assertion = signing_input + b"." + b64url(sign_rs256(signing_input, creds["private_key"]))

    body = urllib.parse.urlencode(
        {"grant_type": JWT_BEARER, "assertion": assertion.decode()}
    ).encode()
    request = urllib.request.Request(
        creds.get("token_uri") or TOKEN_URI,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise Failure(
            "Google refused the credentials (HTTP %s):\n%s\n"
            "If this says invalid_grant, the machine clock may be wrong or the key may be revoked."
            % (exc.code, detail.strip())
        )
    except urllib.error.URLError as exc:
        raise Failure("could not reach %s: %s" % (TOKEN_URI, exc.reason))

    if not payload.get("access_token"):
        raise Failure("no access_token in Google's reply: %s" % payload)
    return payload["access_token"]


def read_values(token, sheet_id, cell_range, client_email=""):
    url = "https://sheets.googleapis.com/v4/spreadsheets/%s/values/%s" % (
        urllib.parse.quote(sheet_id, safe=""),
        urllib.parse.quote(cell_range, safe=""),
    )
    request = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read()).get("values", [])
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")

        # Two very different problems both come back as 403. The API-disabled
        # one names the API in its message; the other is simply not shared.
        if exc.code == 403 and "has not been used in project" in detail:
            raise Failure(
                "the Google Sheets API is not enabled on this project yet.\n"
                "Enable it here, wait a minute, then retry:\n"
                "  https://console.cloud.google.com/apis/library/sheets.googleapis.com"
            )

        if exc.code in (403, 404):
            raise Failure(
                "Google returned HTTP %s for that spreadsheet, which means the\n"
                "credentials are fine but this account cannot see the sheet.\n\n"
                "Open the sheet, click Share, and add this address as Viewer:\n"
                "  %s\n\n"
                "A 404 here means the same thing as a 403: an unshared sheet is\n"
                "indistinguishable from one that does not exist."
                % (exc.code, client_email or "run --whoami to print it")
            )
        raise Failure("Sheets API error HTTP %s:\n%s" % (exc.code, detail.strip()))
    except urllib.error.URLError as exc:
        raise Failure("could not reach the Sheets API: %s" % exc.reason)


def column_letter(index):
    letters = ""
    index += 1
    while index:
        index, remainder = divmod(index - 1, 26)
        letters = chr(ord("A") + remainder) + letters
    return letters


def describe_mapping(header_row, mapping, event_cols):
    """Print what matched and what did not.

    A column silently failing to map is the dangerous failure here: with no
    events at all, every invite renders with an empty schedule, and nothing
    else in the pipeline would notice.
    """
    print("column mapping:")
    used = set()
    for column in COLUMNS:
        index = mapping.get(column)
        if index is None:
            print("  %-15s -> MISSING" % column)
        else:
            used.add(index)
            header = header_row[index] if index < len(header_row) else "?"
            print("  %-15s <- column %s %r" % (column, column_letter(index), header))

    for key in sorted(event_cols):
        index = event_cols[key]
        used.add(index)
        header = header_row[index] if index < len(header_row) else "?"
        print("  event %-9s <- column %s %r" % (key, column_letter(index), header))

    spare = [
        (column_letter(i), raw)
        for i, raw in enumerate(header_row)
        if i not in used and str(raw).strip()
    ]
    if spare:
        print("ignored sheet columns: %s" % ", ".join("%s %r" % s for s in spare))


def map_event_columns(header_row):
    """Sheet column index for each event key, for grid-shaped guest lists."""
    found = {}
    for index, raw in enumerate(header_row):
        key = EVENT_COLUMNS.get(normalise(raw))
        if key and key not in found:
            found[key] = index
    return found


def map_headers(header_row):
    """Sheet column index for each of our CSV columns."""
    seen = {}
    for index, raw in enumerate(header_row):
        key = normalise(raw)
        if key and key not in seen:
            seen[key] = index

    mapping = {}
    for column, names in ALIASES.items():
        for candidate in names:
            if candidate in seen:
                mapping[column] = seen[candidate]
                break

    missing = [column for column in REQUIRED if column not in mapping]
    if missing:
        raise Failure(
            "the sheet has no column for: %s\n"
            "Header row was: %s\n"
            "Rename a column to one of the accepted spellings, for example %s."
            % (
                ", ".join(missing),
                ", ".join(repr(h) for h in header_row) or "(empty)",
                ", ".join(ALIASES[missing[0]][:3]),
            )
        )
    return mapping


def existing_tokens(path):
    """Tokens already issued locally, keyed by serial number and by name.

    A token is a live URL the moment it is sent to someone. Re-pulling a sheet
    that does not yet carry the tokens must not silently orphan those links, so
    anything already in guests.csv wins over a blank cell in the sheet.

    Serial number is the reliable key; name is kept only as a fallback for
    lists that have no serial column, and is unusable when it is not unique.
    """
    empty = {"by_sno": {}, "by_name": {}}
    if not path.exists():
        return empty
    try:
        with path.open(newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
    except (OSError, csv.Error):
        return empty

    by_sno = {}
    by_name = {}
    duplicated = set()
    for row in rows:
        token = (row.get("token") or "").strip()
        if not token:
            continue
        sno = (row.get("sno") or "").strip()
        name = (row.get("name") or "").strip().lower()
        if sno:
            by_sno.setdefault(sno, token)
        if name:
            if name in by_name:
                duplicated.add(name)
            by_name.setdefault(name, token)
    for name in duplicated:
        # Two guests with this name already hold tokens. Matching on name could
        # hand one person the other's invite, so refuse to match on it at all.
        by_name.pop(name, None)
    return {"by_sno": by_sno, "by_name": by_name}


def events_from_grid(raw, event_cols):
    """Turn one-column-per-event marks into the space separated key list."""
    keys = []
    for key in ("pellikoduku", "cocktail", "haldimehendi", "wedding"):
        index = event_cols.get(key)
        if index is None or index >= len(raw):
            continue
        if str(raw[index] or "").strip().lower() in TRUTHY:
            keys.append(key)
    return " ".join(keys)


def build_rows(values, mapping, event_cols, carried):
    rows = []
    blank = 0
    reused = []
    unmatched_marks = set()

    for raw in values:
        def cell(column):
            index = mapping.get(column)
            if index is None or index >= len(raw):
                return ""
            return str(raw[index] or "").strip()

        name = cell("name")
        if not name:
            # Blank rows and the totals row at the bottom both land here. The
            # totals row holds sums under the event columns, so dropping it on
            # "no name" is what keeps those out of the guest list.
            blank += 1
            continue

        row = {column: cell(column) for column in COLUMNS}

        # An explicit list column wins if present; otherwise derive from the
        # grid. Doing it in this order means adding an events_invited column
        # later overrides the grid without having to delete it.
        if not row["events_invited"] and event_cols:
            row["events_invited"] = events_from_grid(raw, event_cols)

        if not row["token"]:
            token = None
            if row["sno"]:
                token = carried["by_sno"].get(row["sno"])
            if not token:
                token = carried["by_name"].get(name.lower())
            if token:
                row["token"] = token
                reused.append(name)

        for index, value in enumerate(raw):
            text = str(value or "").strip().lower()
            if (
                text in TRUTHY
                and index not in event_cols.values()
                and index not in mapping.values()
            ):
                unmatched_marks.add(index)

        rows.append(row)

    if blank:
        print("skipped %d row(s) with no name" % blank)
    if reused:
        print(
            "kept %d existing token(s) the sheet does not have yet: %s"
            % (len(reused), ", ".join(reused))
        )

    names = [row["name"].lower() for row in rows]
    duplicates = sorted({name for name in names if names.count(name) > 1})
    # "is None", not falsiness: a serial column in column A maps to index 0.
    if duplicates and mapping.get("sno") is None:
        # Without a serial column there is nothing stable to match a re-import
        # against, so a shared first name could move a live link.
        warn(
            "duplicate names and no serial column, so token carry-over is\n"
            "ambiguous for: %s" % ", ".join(duplicates)
        )

    snos = [row["sno"] for row in rows if row["sno"]]
    repeated = sorted({s for s in snos if snos.count(s) > 1})
    if repeated:
        raise Failure(
            "these serial numbers appear more than once: %s\n"
            "They are what a re-import matches tokens on, so they have to be unique."
            % ", ".join(repeated)
        )

    tokens = [row["token"] for row in rows if row["token"]]
    clashes = sorted({token for token in tokens if tokens.count(token) > 1})
    if clashes:
        raise Failure(
            "the same token appears on more than one guest: %s\n"
            "Two people would share one invite page. Fix the sheet first."
            % ", ".join(clashes)
        )
    return rows


def write_csv(rows, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--sheet",
        default=os.environ.get("INVITE_SHEET_ID", ""),
        help="spreadsheet id, the long string in its URL (or set INVITE_SHEET_ID)",
    )
    parser.add_argument(
        "--range",
        dest="cell_range",
        default="A:Z",
        help="A1 range including the header row, e.g. 'Guests!A:Z' (default A:Z of the first tab)",
    )
    parser.add_argument("--credentials", type=Path, default=CREDENTIALS)
    parser.add_argument("--out", type=Path, default=OUT)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="show what would be written without touching the CSV",
    )
    parser.add_argument(
        "--whoami",
        action="store_true",
        help="print the address to share the sheet with, then exit",
    )
    args = parser.parse_args(argv)

    # Needs no sheet and no network: this is the address the sheet has to be
    # shared with, and not sharing it is the usual cause of a 403.
    if args.whoami:
        creds = load_credentials(args.credentials)
        print(creds["client_email"])
        print("\nShare the sheet with that address (Viewer is enough).")
        return 0

    if not args.sheet:
        parser.error("--sheet is required (or set INVITE_SHEET_ID)")

    creds = load_credentials(args.credentials)
    print("authenticating as %s" % creds["client_email"])
    values = read_values(
        access_token(creds), args.sheet, args.cell_range, creds["client_email"]
    )

    if not values:
        raise Failure(
            "that range came back empty. Check the tab name in --range; the "
            "default A:Z only reads the first tab."
        )

    mapping = map_headers(values[0])
    event_cols = map_event_columns(values[0])
    if args.dry_run:
        describe_mapping(values[0], mapping, event_cols)

    if "events_invited" not in mapping and not event_cols:
        raise Failure(
            "found no events in this sheet, so every invite would show an empty\n"
            "schedule. Either add one column per event named Pelli Koduku, Cocktail,\n"
            "Haldi and Wedding holding 1 or 0, or a single events_invited column\n"
            "holding space separated keys from:\n"
            "  pellikoduku cocktail haldimehendi wedding"
        )

    rows = build_rows(values[1:], mapping, event_cols, existing_tokens(args.out))
    if not rows:
        raise Failure("no guest rows found below the header")

    without = sum(1 for row in rows if not row["token"])
    print("read %d guest(s); %d still need a token" % (len(rows), without))

    missing = sorted(set(("pellikoduku", "cocktail", "haldimehendi", "wedding")) - set(event_cols))
    if event_cols and missing and "events_invited" not in mapping:
        warn(
            "no column found for: %s\n"
            "Nobody will be invited to those, which is wrong unless they are deliberate."
            % ", ".join(missing)
        )

    empty = [row["name"] for row in rows if not row["events_invited"]]
    if empty:
        # generate.py refuses to build a page with an empty schedule, so this is
        # a heads-up about rows to fix in the sheet, not a page that shipped.
        warn(
            "%d guest(s) are invited to nothing, so they get no page until the\n"
            "sheet says what they are invited to: %s%s"
            % (len(empty), ", ".join(empty[:8]), "..." if len(empty) > 8 else "")
        )

    counts = {}
    for row in rows:
        for key in row["events_invited"].split():
            counts[key] = counts.get(key, 0) + 1
    print(
        "invited per event: %s"
        % ", ".join("%s=%d" % (k, counts.get(k, 0)) for k in
                    ("pellikoduku", "cocktail", "haldimehendi", "wedding"))
    )

    if args.dry_run:
        print("\ndry run, %s not written" % args.out)
        print("first rows:")
        for row in rows[:6]:
            print(
                "  %-4s %-12s %-20s %s"
                % (
                    row["sno"] or "-",
                    row["token"] or "(no token)",
                    row["name"],
                    row["events_invited"] or "(none)",
                )
            )
        return 0

    write_csv(rows, args.out)
    print("wrote %s" % args.out)
    if without:
        print("next: python3 tools/invite/generate.py --tokens %s" % args.out)
    print(
        "\nThis file is gitignored and holds the whole guest list. Keep it that way."
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Failure as error:
        print("error: %s" % error, file=sys.stderr)
        sys.exit(1)
