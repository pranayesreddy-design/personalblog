/**
 * RSVP endpoint for the wedding invite. Paste this into the Apps Script editor
 * of the guest spreadsheet (Extensions > Apps Script), then Deploy > New
 * deployment > Web app, with:
 *
 *   Execute as:      Me
 *   Who has access:  Anyone
 *
 * "Anyone" is required because guests are not signed into Google. It does not
 * expose the sheet: this script is the only way in, and it only ever writes.
 *
 * Copy the /exec URL it gives you into RSVP_ENDPOINT in assets/js/invite.js.
 *
 * Two constraints come from Apps Script itself and shape the code below:
 *
 *  - There is no doOptions, and CORS response headers cannot be set. Only
 *    "simple" cross-origin requests work, so the client posts a JSON string as
 *    text/plain and we parse e.postData.contents by hand. Posting as
 *    application/json would trigger a preflight and fail with 405.
 *  - Redeploying changes nothing about the URL only if you "Manage
 *    deployments" and edit the existing one. A brand new deployment gets a new
 *    URL, which would silently break every invite already sent.
 */

// The guest list is split across one tab per side ("Pranay", "Shruti"), and
// more may be added, so every tab is searched rather than one named one. Only
// the output tabs below are skipped; a tab with no token column is ignored
// anyway, so an unrelated tab costs nothing but a read.
var RSVP_SHEET = "RSVPs";
var SKIP_SHEETS = [RSVP_SHEET];

var RSVP_HEADERS = [
  "received_at",
  "token",
  "name",
  "side",
  "attending",
  "events",
  "note"
];

/** Normalise a header so "Guest Name", "guest_name" and "guestname" match. */
function normaliseHeader(value) {
  return String(value == null ? "" : value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Column index (0-based) for each accepted spelling in a header row. */
function headerIndex(headerRow) {
  var index = {};
  for (var i = 0; i < headerRow.length; i++) {
    var key = normaliseHeader(headerRow[i]);
    if (key && !(key in index)) {
      index[key] = i;
    }
  }
  return index;
}

function firstIndexOf(index, names) {
  for (var i = 0; i < names.length; i++) {
    if (names[i] in index) {
      return index[names[i]];
    }
  }
  return -1;
}

function reply(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/**
 * With ?token=, the latest answer for that invite, so a guest who replied on
 * one device sees it on another. Without one, a health check: visiting the URL
 * in a browser is the quickest way to confirm a deployment is live.
 *
 * This hands an answer to anyone holding the token, which is exactly who can
 * already open that guest's invite page. An unknown token gets the same refusal
 * as a POST, so the endpoint cannot be used to list who has replied.
 */
function doGet(e) {
  var token = String((e && e.parameter && e.parameter.token) || "").trim();
  if (!token) {
    return reply({ ok: true, service: "wedding-rsvp" });
  }
  if (!/^[a-z0-9]{6,12}$/.test(token)) {
    return reply({ ok: false, error: "bad token" });
  }

  try {
    var book = SpreadsheetApp.getActiveSpreadsheet();
    if (!findGuest(book, token)) {
      return reply({ ok: false, error: "unknown token" });
    }
    return reply({ ok: true, answer: latestAnswer(book, token) });
  } catch (err) {
    console.error(err);
    return reply({ ok: false, error: "server" });
  }
}

/**
 * The most recent RSVPs row for a token, or null. Rows are appended in order,
 * so the last match wins; every earlier answer stays in the sheet as history.
 */
function latestAnswer(book, token) {
  var sheet = book.getSheetByName(RSVP_SHEET);
  if (!sheet || sheet.getLastRow() < 2) {
    return null;
  }
  var values = sheet.getDataRange().getValues();
  var index = headerIndex(values[0]);
  var col = {
    token: firstIndexOf(index, ["token"]),
    attending: firstIndexOf(index, ["attending"]),
    events: firstIndexOf(index, ["events"]),
    note: firstIndexOf(index, ["note"]),
    when: firstIndexOf(index, ["receivedat"])
  };
  if (col.token < 0 || col.attending < 0) {
    return null;
  }
  for (var row = values.length - 1; row >= 1; row--) {
    if (String(values[row][col.token] || "").trim() !== token) {
      continue;
    }
    var attending = String(values[row][col.attending] || "").trim();
    if (attending !== "yes" && attending !== "no") {
      continue;
    }
    var events = col.events >= 0 ? String(values[row][col.events] || "").trim() : "";
    var when = col.when >= 0 ? values[row][col.when] : "";
    return {
      attending: attending,
      events: events ? events.split(/\s+/) : [],
      note: col.note >= 0 ? String(values[row][col.note] || "") : "",
      received_at: when instanceof Date ? when.toISOString() : String(when || "")
    };
  }
  return null;
}

function doPost(e) {
  // One at a time. Two guests submitting together could otherwise read the
  // same last row and have one overwrite the other.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return reply({ ok: false, error: "busy" });
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return reply({ ok: false, error: "empty request" });
    }

    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (err) {
      return reply({ ok: false, error: "bad json" });
    }

    var token = String(data.token || "").trim();
    var attending = String(data.attending || "").trim();

    if (!/^[a-z0-9]{6,12}$/.test(token)) {
      return reply({ ok: false, error: "bad token" });
    }
    if (attending !== "yes" && attending !== "no") {
      return reply({ ok: false, error: "bad attending" });
    }

    var book = SpreadsheetApp.getActiveSpreadsheet();

    // The endpoint URL is public, so an unknown token is the only thing
    // standing between this sheet and anyone who finds the URL. Reject it
    // before writing anything.
    var guest = findGuest(book, token);
    if (!guest) {
      return reply({ ok: false, error: "unknown token" });
    }

    var events = [];
    if (attending === "yes" && Object.prototype.toString.call(data.events) === "[object Array]") {
      for (var i = 0; i < data.events.length; i++) {
        var key = String(data.events[i] || "").trim();
        if (/^[a-z0-9]{1,40}$/.test(key)) {
          events.push(key);
        }
      }
    }

    var note = String(data.note || "").trim();
    if (note.length > 2000) {
      note = note.slice(0, 2000);
    }

    var now = new Date();
    appendRsvp(book, [
      now,
      token,
      guest.name,
      guest.side,
      attending,
      events.join(" "),
      note
    ]);
    markGuestResponded(guest, attending, now, events, note);

    return reply({ ok: true });
  } catch (err) {
    // Never leak a stack trace to the page; the guest can do nothing with it.
    console.error(err);
    return reply({ ok: false, error: "server" });
  } finally {
    lock.releaseLock();
  }
}

function shouldSkip(name) {
  for (var i = 0; i < SKIP_SHEETS.length; i++) {
    if (SKIP_SHEETS[i] === name) {
      return true;
    }
  }
  return false;
}

/** Find the token on any guest tab. Returns null if no tab has it. */
function findGuest(book, token) {
  var sheets = book.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    if (shouldSkip(sheets[s].getName())) {
      continue;
    }
    var found = findGuestOnSheet(sheets[s], token);
    if (found) {
      return found;
    }
  }
  return null;
}

function findGuestOnSheet(sheet, token) {
  var values = sheet.getDataRange().getValues();
  if (!values.length) {
    return null;
  }
  var index = headerIndex(values[0]);
  var tokenCol = firstIndexOf(index, ["token", "code", "invitetoken", "invitecode"]);
  var nameCol = firstIndexOf(index, ["name", "guest", "guestname", "invitee"]);
  // No token column means this is not a guest tab.
  if (tokenCol < 0) {
    return null;
  }

  for (var row = 1; row < values.length; row++) {
    if (String(values[row][tokenCol] || "").trim() === token) {
      return {
        sheet: sheet,
        side: sheet.getName(),
        row: row + 1, // getRange is 1-based and row 1 is the header
        name: nameCol >= 0 ? String(values[row][nameCol] || "").trim() : "",
        index: index,
        values: values[row]
      };
    }
  }
  return null;
}

function appendRsvp(book, row) {
  var sheet = book.getSheetByName(RSVP_SHEET);
  if (!sheet) {
    sheet = book.insertSheet(RSVP_SHEET);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(RSVP_HEADERS);
    sheet.setFrozenRows(1);
  }
  sheet.appendRow(row);
}

// Per event: the headers its invite column may carry, matching EVENT_COLUMNS in
// fetch_guests.py, and the headers of the column that gets the RSVP count.
var EVENT_RSVP = [
  {
    key: "pellikoduku",
    invite: ["pellikoduku", "pellikuduku", "pellikurukku"],
    rsvp: ["rsvppellikoduku", "rsvppellikuduku"]
  },
  {
    key: "cocktail",
    invite: ["cocktail", "cocktailparty"],
    rsvp: ["rsvpcocktail", "rsvpcocktailparty"]
  },
  {
    key: "haldimehendi",
    invite: ["haldi", "haldimehendi", "haldimehndi", "mehendi", "mehndi"],
    rsvp: ["rsvphaldi", "rsvphaldimehendi", "rsvpmehendi"]
  },
  {
    key: "wedding",
    invite: ["wedding", "marriage", "themarriage", "muhurtham", "weddingconfidence"],
    rsvp: ["rsvpwedding", "rsvpmarriage"]
  }
];

var TRUTHY = ["y", "yes", "true", "x", "\u2713", "\u2714", "yep"];

/**
 * How many people an invite cell stands for, the same rule as head_count() in
 * fetch_guests.py: a number is a head count, a tick is one, anything else none.
 */
function headCount(value) {
  var cell = String(value == null ? "" : value).trim().toLowerCase();
  if (!cell) {
    return 0;
  }
  if (TRUTHY.indexOf(cell) !== -1) {
    return 1;
  }
  var number = Number(cell);
  if (isNaN(number) || number < 1) {
    return 0;
  }
  return Math.floor(number + 0.5);
}

/**
 * Mirror the answer onto the guest row, if those columns exist. Best effort:
 * the RSVPs tab is the real record, so a missing column must not fail the
 * request after the response has already been stored.
 *
 * Each "RSVP <event>" column gets a number so it can be summed like the
 * Confidence columns it is meant to replace: the head count the guest was
 * invited with for an event they are coming to, 0 for one they are not.
 * Events they were never invited to stay blank, so a 0 always means "invited,
 * declined" rather than "not on the list". The form does not ask how many are
 * coming, so a household invited as 2 that says yes counts as 2.
 */
function markGuestResponded(guest, attending, when, events, note) {
  var index = guest.index;
  var cells = guest.values || [];

  function write(col, value) {
    guest.sheet.getRange(guest.row, col + 1).setValue(value);
  }

  var statusCol = firstIndexOf(index, ["rsvpstatus", "rsvp", "status", "attending"]);
  var whenCol = firstIndexOf(index, ["respondedat", "responded", "repliedat", "timestamp"]);
  var noteCol = firstIndexOf(index, ["rsvpnote", "rsvpmessage"]);
  if (statusCol >= 0) {
    write(statusCol, attending);
  }
  if (whenCol >= 0) {
    write(whenCol, when);
  }
  if (noteCol >= 0) {
    // Written even when empty, so a later answer with no note clears the
    // earlier one rather than leaving it beside an answer it no longer fits.
    write(noteCol, note || "");
  }

  for (var i = 0; i < EVENT_RSVP.length; i++) {
    var event = EVENT_RSVP[i];
    var rsvpCol = firstIndexOf(index, event.rsvp);
    if (rsvpCol < 0) {
      continue;
    }
    var inviteCol = firstIndexOf(index, event.invite);
    var invited = inviteCol >= 0 ? headCount(cells[inviteCol]) : 0;
    if (!invited) {
      continue;
    }
    var coming = attending === "yes" && (events || []).indexOf(event.key) !== -1;
    write(rsvpCol, coming ? invited : 0);
  }
}
