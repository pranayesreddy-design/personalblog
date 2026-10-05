#!/usr/bin/env python3
"""Tests for fetch_guests.py. No network, no credentials, no packages.

    python3 tools/invite/test_fetch_guests.py

Worth having because two of these failures would be silent and expensive: a
column that stops mapping gives every guest an empty schedule, and a broken
token carry-over hands someone else's invite to the wrong person.
"""

import csv
import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_guests as fg

GRID = ["S.No", "Name", "Pelli Koduku", "Cocktail", "Haldi", "Wedding"]

passed = 0
work = Path(tempfile.mkdtemp(prefix="invite-tests-"))


def check(label):
    global passed
    passed += 1
    print("%2d. %s" % (passed, label))


def no_tokens():
    return fg.existing_tokens(work / "does-not-exist.csv")


def build(rows, header=None, carried=None, side=""):
    header = header or GRID
    return fg.build_rows(
        rows,
        fg.map_headers(header),
        fg.map_event_columns(header),
        carried if carried is not None else no_tokens(),
        side=side,
    )


# --- header mapping -------------------------------------------------------

check("messy real-world headers map to our columns")
messy = ["Guest Name", "Invite Code", "Photo URL", "Family", "Invited To", "RSVP"]
mapping = fg.map_headers(messy)
assert mapping["name"] == 0 and mapping["token"] == 1, mapping
assert mapping["events_invited"] == 4 and mapping["rsvp_status"] == 5, mapping

check("a sheet with no name column is rejected")
try:
    fg.map_headers(["Token", "Notes"])
except fg.Failure as exc:
    assert "name" in str(exc), exc
else:
    raise AssertionError("accepted a sheet with no name column")

check("one column per event is recognised")
assert fg.map_event_columns(GRID) == {
    "pellikoduku": 2,
    "cocktail": 3,
    "haldimehendi": 4,
    "wedding": 5,
}, fg.map_event_columns(GRID)

check("alternative event spellings map too")
alt = ["S.No", "Name", "Pelli Kuduku", "Cocktail Party", "Mehendi", "Marriage"]
assert fg.map_event_columns(alt) == {
    "pellikoduku": 2,
    "cocktail": 3,
    "haldimehendi": 4,
    "wedding": 5,
}, fg.map_event_columns(alt)

check("column letters are correct past Z")
assert fg.column_letter(0) == "A", fg.column_letter(0)
assert fg.column_letter(25) == "Z", fg.column_letter(25)
assert fg.column_letter(26) == "AA", fg.column_letter(26)
assert fg.column_letter(27) == "AB", fg.column_letter(27)

# --- turning a grid into event keys ---------------------------------------

check("a grid of 1 and 0 becomes the key list")
rows = build([["1", "Kishan", "1", "1", "1", "1"], ["8", "Ratan", "0", "0", "0", "1"]])
assert rows[0]["events_invited"] == "pellikoduku cocktail haldimehendi wedding", rows[0]
assert rows[1]["events_invited"] == "wedding", rows[1]

check("keys come out in schedule order, not column order")
shuffled = ["S.No", "Name", "Wedding", "Haldi", "Cocktail", "Pelli Koduku"]
rows = build([["1", "X", "1", "1", "1", "1"]], shuffled)
assert rows[0]["events_invited"] == "pellikoduku cocktail haldimehendi wedding", rows[0]

check("a blank cell means not invited")
rows = build([["1", "X", "", "1", "", ""]])
assert rows[0]["events_invited"] == "cocktail", rows[0]

check("a cell holds a head count, so 4 means invited as four")
# The sheet's SUM row reads 191 for 188 ticked wedding rows because one cell
# holds a 4. Reading only "1" as invited dropped that row entirely.
rows = build([["90", "Avan", "0", "0", "0", "4"]])
assert rows[0]["events_invited"] == "wedding", rows[0]
assert rows[0]["party_size"] == "4", rows[0]

check("party size is the largest count, not the sum across events")
rows = build([["1", "Elsie", "0", "2", "0", "1"]])
assert rows[0]["events_invited"] == "cocktail wedding", rows[0]
assert rows[0]["party_size"] == "2", rows[0]

check("a single person carries no party size")
rows = build([["1", "X", "0", "1", "0", "1"]])
assert rows[0]["party_size"] == "", rows[0]

check("words still work for sheets that tick instead of counting")
for mark in ("y", "Yes", "TRUE", "x", "✓"):
    rows = build([["1", "X", mark, "", "", ""]])
    assert rows[0]["events_invited"] == "pellikoduku", (mark, rows[0])

check("zero, blank and free text are all not invited")
for mark in ("0", "", "   ", "maybe", "tbc", "-", "0.0"):
    rows = build([["1", "X", mark, "", "", ""]])
    assert rows[0]["events_invited"] == "", (mark, rows[0])

check("head_count rounds rather than truncating")
assert fg.head_count("1") == 1
assert fg.head_count("2") == 2
assert fg.head_count("1.5") == 2, fg.head_count("1.5")
assert fg.head_count("0.3333333333") == 0, fg.head_count("0.3333333333")

check("an explicit events column overrides the grid")
with_list = GRID + ["events_invited"]
rows = build([["1", "Kishan", "1", "1", "1", "1", "wedding"]], with_list)
assert rows[0]["events_invited"] == "wedding", rows[0]

# --- rows that are not guests ---------------------------------------------

check("the SUM row is dropped because it has no name")
rows = build(
    [["1", "Kishan", "1", "0", "0", "1"], ["SUM", "", "29", "86", "100", "191"]]
)
assert len(rows) == 1 and rows[0]["name"] == "Kishan", rows

check("short rows do not crash when trailing cells are missing")
rows = build([["1", "Kishan"]])
assert rows[0]["name"] == "Kishan" and rows[0]["events_invited"] == "", rows[0]

# --- token carry-over, the dangerous part ---------------------------------

issued = work / "guests.csv"
with issued.open("w", newline="", encoding="utf-8") as handle:
    writer = csv.DictWriter(handle, fieldnames=fg.COLUMNS)
    writer.writeheader()
    writer.writerow({"token": "aaaaaaaaaa", "name": "Ajay", "side": "Pranay", "sno": "20"})
    writer.writerow({"token": "bbbbbbbbbb", "name": "Ajay", "side": "Pranay", "sno": "55"})
    writer.writerow({"token": "cccccccccc", "name": "Kishan", "side": "Pranay", "sno": "1"})
    writer.writerow({"token": "dddddddddd", "name": "Elsie", "side": "Shruti", "sno": "1"})
carried = fg.existing_tokens(issued)

check("tab and serial together are the carry-over key")
assert carried["by_sno"][fg.carry_key("Pranay", "20")] == "aaaaaaaaaa", carried
assert carried["by_sno"][fg.carry_key("Pranay", "1")] == "cccccccccc", carried
assert carried["by_sno"][fg.carry_key("Shruti", "1")] == "dddddddddd", carried

check("serial 1 on each tab keeps its own link")
# Both tabs number from 1 and 39 serials are shared between them, so an
# unscoped serial would hand one side's live link to the other side's guest.
rows = build([["1", "Elsie", "0", "2", "0", "0"]], carried=carried, side="Shruti")
assert rows[0]["token"] == "dddddddddd", rows[0]
rows = build([["1", "Kishan", "1", "1", "1", "1"]], carried=carried, side="Pranay")
assert rows[0]["token"] == "cccccccccc", rows[0]

check("a name shared by two token holders is refused as a key")
assert "ajay" not in carried["by_name"], carried["by_name"]
assert carried["by_name"]["kishan"] == "cccccccccc", carried["by_name"]

check("same-name guests keep their own links across a re-import")
rows = build(
    [["55", "Ajay", "0", "0", "0", "1"], ["20", "Ajay", "1", "1", "1", "1"]],
    carried=carried,
    side="Pranay",
)
assert rows[0]["token"] == "bbbbbbbbbb", rows[0]
assert rows[1]["token"] == "aaaaaaaaaa", rows[1]

NO_SNO = ["X", "Name", "Pelli Koduku", "Cocktail", "Haldi", "Wedding"]

check("an ambiguous name with no serial never guesses a token")
rows = build([["", "Ajay", "0", "0", "0", "1"]], NO_SNO, carried=carried)
assert rows[0]["token"] == "", rows[0]

check("a unique name still carries over without a serial")
rows = build([["", "Kishan", "0", "0", "0", "1"]], NO_SNO, carried=carried)
assert rows[0]["token"] == "cccccccccc", rows[0]

check("a token in the sheet beats the local copy")
with_token = ["S.No", "Name", "Pelli Koduku", "Cocktail", "Haldi", "Wedding", "Token"]
rows = build(
    [["20", "Ajay", "0", "0", "0", "1", "zzzzzzzzzz"]],
    with_token,
    carried=carried,
    side="Pranay",
)
assert rows[0]["token"] == "zzzzzzzzzz", rows[0]

check("two guests sharing a token is a hard error")
rows = build(
    [["1", "A", "0", "0", "0", "1"], ["2", "B", "0", "0", "0", "1"]],
    carried={"by_sno": {fg.carry_key("", "1"): "same123456",
                        fg.carry_key("", "2"): "same123456"}, "by_name": {}},
)
try:
    fg.check_combined(rows)
except fg.Failure as exc:
    assert "more than one guest" in str(exc), exc
else:
    raise AssertionError("allowed two guests to share a token")

check("duplicate serial numbers on one tab are a hard error")
try:
    build([["7", "A", "1", "0", "0", "1"], ["7", "B", "1", "0", "0", "1"]])
except fg.Failure as exc:
    assert "more than once" in str(exc), exc
else:
    raise AssertionError("duplicate serials accepted")

check("the same serial on two different tabs is fine")
combined = build([["1", "Kishan", "1", "0", "0", "1"]], side="Pranay")
combined += build([["1", "Elsie", "0", "2", "0", "0"]], side="Shruti")
fg.check_combined(combined)
assert [row["side"] for row in combined] == ["Pranay", "Shruti"], combined

# --- credentials ----------------------------------------------------------

check("the CSV header matches what the generator reads")
out = work / "out.csv"
fg.write_csv(build([["1", "Kishan", "1", "0", "0", "1"]]), out)
header = out.read_text(encoding="utf-8").splitlines()[0]
assert header == ",".join(fg.COLUMNS), header

check("missing credentials point at the setup docs")
try:
    fg.load_credentials(work / "nope.json")
except fg.Failure as exc:
    assert "RULEBOOK" in str(exc), exc
else:
    raise AssertionError("missing credentials accepted")

check("an OAuth client file is rejected as not a service account")
bad = work / "oauth-client.json"
bad.write_text(json.dumps({"installed": {"client_id": "x"}}), encoding="utf-8")
bad.chmod(0o600)  # otherwise the permissions warning fires and muddies output
try:
    fg.load_credentials(bad)
except fg.Failure as exc:
    assert "client_email" in str(exc), exc
else:
    raise AssertionError("an OAuth client file was accepted")

check("base64url output is unpadded and URL safe")
assert fg.b64url(b"\xfb\xff\xfe") == b"-__-", fg.b64url(b"\xfb\xff\xfe")
assert b"=" not in fg.b64url(b"a")

check("the JWT signature verifies, and a tampered one does not")
key = work / "test-key.pem"
pub = work / "test-key.pub"
subprocess.run(
    ["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048",
     "-out", str(key)],
    check=True, capture_output=True,
)
subprocess.run(
    ["openssl", "rsa", "-in", str(key), "-pubout", "-out", str(pub)],
    check=True, capture_output=True,
)
message = b"eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJ0ZXN0In0"
signature = fg.sign_rs256(message, key.read_text(encoding="utf-8"))
assert len(signature) == 256, len(signature)
sig = work / "sig.bin"
sig.write_bytes(signature)
verify = ["openssl", "dgst", "-sha256", "-verify", str(pub), "-signature", str(sig)]
assert b"Verified OK" in subprocess.run(
    verify, input=message, capture_output=True
).stdout
assert b"Verified OK" not in subprocess.run(
    verify, input=message + b"x", capture_output=True
).stdout

check("signing leaves no private key behind in the temp directory")
before = set(Path(tempfile.gettempdir()).glob("invite-sa-*"))
fg.sign_rs256(b"x", key.read_text(encoding="utf-8"))
assert set(Path(tempfile.gettempdir()).glob("invite-sa-*")) == before

print("\n%d checks passed" % passed)
