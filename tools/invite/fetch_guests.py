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

# The CSV columns the generator expects, in order.
COLUMNS = [
    "token",
    "name",
    "photo_url",
    "household_id",
    "events_invited",
    "caption",
    "rsvp_status",
    "responded_at",
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
}

# Only a name is genuinely required. Tokens are generated locally by
# generate.py --tokens, and every other column is optional per guest.
REQUIRED = ["name"]


class Failure(Exception):
    """Something the user needs to fix, reported without a traceback."""


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
        print(
            "warning: %s is mode %o; tighten it with chmod 600" % (path, mode),
            file=sys.stderr,
        )

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
    """Tokens already issued locally, keyed by lowercased name.

    A token is a live URL the moment it is sent to someone. Re-pulling a sheet
    that does not yet carry the tokens must not silently orphan those links, so
    anything already in guests.csv wins over a blank cell in the sheet.
    """
    if not path.exists():
        return {}
    try:
        with path.open(newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
    except (OSError, csv.Error):
        return {}
    found = {}
    for row in rows:
        name = (row.get("name") or "").strip().lower()
        token = (row.get("token") or "").strip()
        if name and token:
            found.setdefault(name, token)
    return found


def build_rows(values, mapping, carried):
    rows = []
    blank = 0
    reused = []
    for raw in values:
        def cell(column):
            index = mapping.get(column)
            if index is None or index >= len(raw):
                return ""
            return (raw[index] or "").strip()

        name = cell("name")
        if not name:
            blank += 1
            continue

        row = {column: cell(column) for column in COLUMNS}
        if not row["token"]:
            carried_token = carried.get(name.lower())
            if carried_token:
                row["token"] = carried_token
                reused.append(name)
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
    if duplicates:
        # Two guests with one name makes the token carry-over ambiguous, so say
        # so rather than guessing which row owns which link.
        print(
            "warning: duplicate names, token carry-over is ambiguous for: %s"
            % ", ".join(duplicates),
            file=sys.stderr,
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

    rows = build_rows(values[1:], map_headers(values[0]), existing_tokens(args.out))
    if not rows:
        raise Failure("no guest rows found below the header")

    without = sum(1 for row in rows if not row["token"])
    print("read %d guest(s); %d still need a token" % (len(rows), without))

    if args.dry_run:
        print("dry run, %s not written" % args.out)
        for row in rows[:5]:
            print("  %s | %s" % (row["token"] or "(no token)", row["name"]))
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
