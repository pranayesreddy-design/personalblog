#!/usr/bin/env python3
"""Tests for generate.py. No network, no packages, no image library.

    python3 tools/invite/test_generate.py

Two of these earn their keep. The image headers are parsed by hand, so a wrong
offset reserves the wrong shape and every page jumps as the photo loads. And
clear_output guards a shutil.rmtree that has already deleted this repo once.

Fixtures are synthesised rather than committed: these parsers only read headers,
so a header with no pixels behind it exercises exactly the same code.
"""

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate as g  # noqa: E402

passed = 0


def check(label):
    global passed
    passed += 1
    print("%2d. %s" % (passed, label))


def png(width, height):
    return (
        b"\x89PNG\r\n\x1a\n"
        + (13).to_bytes(4, "big")
        + b"IHDR"
        + width.to_bytes(4, "big")
        + height.to_bytes(4, "big")
        + b"\x08\x02\x00\x00\x00"
    )


def jpeg(width, height, orientation=None, before_frame=b""):
    out = b"\xff\xd8"
    if orientation is not None:
        tiff = (
            b"II*\x00"
            + (8).to_bytes(4, "little")
            + (1).to_bytes(2, "little")
            + b"\x12\x01\x03\x00\x01\x00\x00\x00"
            + orientation.to_bytes(2, "little")
            + b"\x00\x00"
            + b"\x00\x00\x00\x00"
        )
        payload = b"Exif\x00\x00" + tiff
        out += b"\xff\xe1" + (len(payload) + 2).to_bytes(2, "big") + payload
    out += before_frame
    # Height first, then width: the order the format actually uses.
    frame = (
        b"\x08"
        + height.to_bytes(2, "big")
        + width.to_bytes(2, "big")
        + b"\x03\x01\x11\x00\x02\x11\x01\x03\x11\x01"
    )
    out += b"\xff\xc0" + (len(frame) + 2).to_bytes(2, "big") + frame
    return out + b"\xff\xda\x00\x08\x01\x01\x00\x00\x3f\x00\xff\xd9"


def webp(body):
    return b"RIFF" + (len(body) + 4).to_bytes(4, "little") + b"WEBP" + body


def webp_lossy(width, height):
    return webp(
        b"VP8 "
        + (30).to_bytes(4, "little")
        + b"\x00\x00\x00\x9d\x01\x2a"
        + width.to_bytes(2, "little")
        + height.to_bytes(2, "little")
        + b"\x00" * 16
    )


def webp_lossless(width, height):
    bits = (width - 1) | ((height - 1) << 14)
    return webp(b"VP8L" + (5).to_bytes(4, "little") + b"\x2f" + bits.to_bytes(4, "little"))


def webp_extended(width, height):
    return webp(
        b"VP8X"
        + (10).to_bytes(4, "little")
        + b"\x00\x00\x00\x00"
        + (width - 1).to_bytes(3, "little")
        + (height - 1).to_bytes(3, "little")
    )


def size_of(data):
    with tempfile.NamedTemporaryFile(suffix=".img", delete=False) as handle:
        handle.write(data)
        path = Path(handle.name)
    try:
        return g.image_size(path)
    finally:
        path.unlink()


check("a landscape JPEG is not reported as a square")
assert size_of(jpeg(1024, 768)) == (1024, 768)

check("a portrait JPEG keeps its height")
assert size_of(jpeg(768, 1024)) == (768, 1024)

check("width and height are not transposed")
# A square fixture cannot catch a transposition, and the two values sit
# adjacent in the file in the opposite order to the one you would guess.
assert size_of(jpeg(300, 900)) == (300, 900)
assert size_of(png(1200, 400)) == (1200, 400)

check("a quarter-turn EXIF tag swaps the stored dimensions")
# A phone portrait is usually a landscape frame plus one of these tags. Taking
# the stored numbers at face value reserves a box of the wrong shape.
for orientation in (5, 6, 7, 8):
    assert size_of(jpeg(1024, 768, orientation)) == (768, 1024), orientation

check("an upright or merely flipped EXIF tag changes nothing")
for orientation in (1, 2, 3, 4):
    assert size_of(jpeg(1024, 768, orientation)) == (1024, 768), orientation

check("a JPEG carrying no EXIF at all still reads")
assert size_of(jpeg(640, 480)) == (640, 480)

check("a comment segment before the frame does not shift the offsets")
assert size_of(
    jpeg(1024, 768, None, b"\xff\xfe" + (22).to_bytes(2, "big") + b"shot on a phone xxxx")
) == (1024, 768)

check("PNG dimensions come out of IHDR")
assert size_of(png(400, 1200)) == (400, 1200)

check("all three WebP flavours report their size")
assert size_of(webp_lossy(800, 600)) == (800, 600)
assert size_of(webp_lossless(640, 960)) == (640, 960)
assert size_of(webp_extended(1920, 1080)) == (1920, 1080)

check("a file that is not an image returns None rather than raising")
assert size_of(b"not an image at all") is None
assert size_of(b"") is None
assert size_of(b"\xff\xd8truncated") is None

check("a missing file returns None rather than raising")
assert g.image_size(Path("/tmp/does-not-exist-9e8d7c.jpg")) is None

check("a remote photo_url is not mistaken for a local file")
assert g.local_photo("https://example.com/a.jpg") is None
assert g.local_photo("../../assets/images/invite/not-there-xyz.jpg") is None

check("the output guard refuses a directory it did not build")
with tempfile.TemporaryDirectory() as temp:
    out = Path(temp) / "someone-elses"
    out.mkdir()
    (out / "precious.txt").write_text("keep me", encoding="utf-8")
    try:
        g.clear_output(out)
    except SystemExit as error:
        assert "refusing to empty" in str(error), error
    else:
        raise AssertionError("cleared a directory with no marker")
    assert (out / "precious.txt").exists(), "deleted the file anyway"

check("the output guard clears a directory it did build")
with tempfile.TemporaryDirectory() as temp:
    out = Path(temp) / "mine"
    out.mkdir()
    (out / g.STAMP).write_text("x", encoding="utf-8")
    (out / "old-page.html").write_text("stale", encoding="utf-8")
    g.clear_output(out)
    assert not out.exists(), "left the old build in place"

check("the output guard accepts a path that does not exist yet")
with tempfile.TemporaryDirectory() as temp:
    g.clear_output(Path(temp) / "brand-new")

check("the output guard refuses a file")
with tempfile.TemporaryDirectory() as temp:
    target = Path(temp) / "a-file"
    target.write_text("x", encoding="utf-8")
    try:
        g.clear_output(target)
    except SystemExit as error:
        assert "not a directory" in str(error), error
    else:
        raise AssertionError("accepted a file as the output directory")

check("the stand-in photo exists and is not the story photo")
stand_in = g.PHOTO_DIR / g.DEFAULT_PHOTO
assert stand_in.exists(), "%s is missing; guests with no photo lose the figure" % stand_in
story = g.PHOTO_DIR / "couple.jpg"
if story.exists():
    assert stand_in.read_bytes() != story.read_bytes(), "the same photo twice on one page"

check("the stylesheet does not crop guest photos to a square")
css = (g.REPO / "assets" / "css" / "invite.css").read_text(encoding="utf-8")
rule = css.split(".guest-photo img")[1].split("}")[0]
assert "aspect-ratio" not in rule, "a forced ratio crops landscape and portrait photos"
assert "max-height" in rule, "a tall portrait would push the RSVP off the screen"

check("every RSVP checkbox shows the same day and time as the schedule")
# Written out twice in the template, once per section, so a time changed in one
# place and not the other would tell a guest two different things.
import html as _html  # noqa: E402
import re as _re  # noqa: E402

template = g.strip_comments(g.TEMPLATE.read_text(encoding="utf-8"))
schedule = {}
for key, body in _re.findall(r'<li class="slot" data-event-key="(\w+)".*?>(.*?)</li>', template, _re.S):
    day = _re.search(r'class="slot-day">(.*?)<', body, _re.S).group(1).strip()
    time = _re.search(r'class="slot-time">\|?\s*(.*?)<', body, _re.S).group(1).strip()
    schedule[key] = "%s · %s" % (_html.unescape(day), _html.unescape(time))
checklist = {
    key: _html.unescape(when).strip()
    for key, when in _re.findall(
        r'name="events" value="(\w+)".*?class="rsvp-when">(.*?)</small>', template, _re.S
    )
}
assert schedule and set(schedule) == set(checklist), (sorted(schedule), sorted(checklist))
for key in schedule:
    assert schedule[key] == checklist[key], "%s: schedule says %r, RSVP says %r" % (
        key, schedule[key], checklist[key])

print("\n%d checks passed" % passed)
