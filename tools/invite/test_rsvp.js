// Tests for rsvp.gs, run against mock spreadsheet services. From the repo root:
//
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc tools/invite/test_rsvp.js
//
// jsc ships with macOS, so this needs no node. Apps Script cannot be run
// locally and every redeploy is a manual round trip, so this is the only place
// the script's logic gets checked before a real guest's answer depends on it.


// ---- mock Apps Script services ---------------------------------------------

function makeSheet(name, rows) {
  return {
    rows: rows,
    getName: function () { return name; },
    getDataRange: function () {
      var self = this;
      return { getValues: function () { return self.rows.map(function (r) { return r.slice(); }); } };
    },
    getLastRow: function () { return this.rows.length; },
    appendRow: function (r) { this.rows.push(r.slice()); },
    setFrozenRows: function () {},
    getRange: function (row, col) {
      var self = this;
      return {
        setValue: function (v) {
          while (self.rows.length < row) self.rows.push([]);
          var r = self.rows[row - 1];
          while (r.length < col) r.push("");
          r[col - 1] = v;
        }
      };
    }
  };
}

var header = ["S.No", "Name", "Cocktail", "Wedding", "Phone number", "Photo", "Token", "Caption"];
var pranay = makeSheet("Pranay", [
  header,
  ["1", "Kishan", "1", "1", "", "", "rc66pchc", ""],
  ["", "", "89", "192", "", "", "", ""]
]);
var test = makeSheet("Test", [
  header.concat(["RSVP Status", "Responded At"]),
  ["T1", "Test Guest", "1", "1", "", "", "2mv9u5fa", "", "", ""]
]);
var sheets = [pranay, test];

var book = {
  getSheets: function () { return sheets; },
  getSheetByName: function (n) {
    for (var i = 0; i < sheets.length; i++) if (sheets[i].getName() === n) return sheets[i];
    return null;
  },
  insertSheet: function (n) { var s = makeSheet(n, []); sheets.push(s); return s; }
};

var SpreadsheetApp = { getActiveSpreadsheet: function () { return book; } };
var ContentService = {
  MimeType: { JSON: "json" },
  createTextOutput: function (t) { return { text: t, setMimeType: function () { return this; } }; }
};
var LockService = { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } };
var console = { error: function (e) { lastError = String(e); } };
var lastError = "";

eval(readFile("tools/invite/rsvp.gs"));

// ---- cases -------------------------------------------------------------------

var out = [];
var failed = 0;

function post(body) {
  var e = body === null ? {} : { postData: { contents: typeof body === "string" ? body : JSON.stringify(body) } };
  return JSON.parse(doPost(e).text);
}

function expect(label, got, want) {
  var ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  out.push((ok ? "ok    " : "FAIL  ") + label + (ok ? "" : "\n        got " + JSON.stringify(got) + " want " + JSON.stringify(want)));
}

expect("GET says the deployment is alive", JSON.parse(doGet().text), { ok: true, service: "wedding-rsvp" });
expect("empty request is refused", post(null), { ok: false, error: "empty request" });
expect("malformed JSON is refused", post("{not json"), { ok: false, error: "bad json" });
expect("a token with bad characters is refused", post({ token: "<script>", attending: "yes" }), { ok: false, error: "bad token" });
expect("attending must be yes or no", post({ token: "2mv9u5fa", attending: "maybe" }), { ok: false, error: "bad attending" });
expect("an unknown token writes nothing", post({ token: "zzzzzzzz", attending: "yes" }), { ok: false, error: "unknown token" });
expect("no RSVPs tab exists after only rejected requests", book.getSheetByName("RSVPs"), null);

expect("the test guest can say yes", post({
  token: "2mv9u5fa", attending: "yes", events: ["cocktail", "wedding", "bad key!"], note: "veg please"
}), { ok: true });

var rsvps = book.getSheetByName("RSVPs");
expect("the RSVPs tab was created with its header", rsvps && rsvps.rows[0], RSVP_HEADERS);
var r = rsvps.rows[1];
expect("the row names the guest from the sheet, not from the request", [r[1], r[2], r[3], r[4]], ["2mv9u5fa", "Test Guest", "Test", "yes"]);
expect("an invalid event key is dropped", r[5], "cocktail wedding");
expect("the note is kept", r[6], "veg please");
expect("the status is mirrored onto the guest row", test.rows[1][8], "yes");
expect("the response time is mirrored too", test.rows[1][9] instanceof Date, true);

expect("a real guest on another tab is found", post({ token: "rc66pchc", attending: "no", events: ["wedding"] }), { ok: true });
expect("saying no records no events", rsvps.rows[2].slice(1, 6), ["rc66pchc", "Kishan", "Pranay", "no", ""]);
expect("a tab without RSVP columns is left alone", pranay.rows[1].length, header.length);

expect("the test guest can change their mind", post({ token: "2mv9u5fa", attending: "no" }), { ok: true });
expect("the mirror shows the latest answer", test.rows[1][8], "no");
expect("both answers are kept as history", rsvps.rows.length, 4);

var longNote = new Array(3001).join("x");
post({ token: "2mv9u5fa", attending: "yes", note: longNote });
expect("an oversized note is truncated, not rejected", rsvps.rows[rsvps.rows.length - 1][6].length, 2000);

// Every RSVP row carries a token. If the RSVPs tab were searched, a guest
// removed from the list could still answer by matching their own old reply.
test.rows[1][6] = "";
expect("a token that only survives in RSVPs is no longer accepted", post({ token: "2mv9u5fa", attending: "yes" }), { ok: false, error: "unknown token" });

// Lookup by token, for showing an answer on a second device -------------------

function get(token) {
  return JSON.parse(doGet({ parameter: token === undefined ? {} : { token: token } }).text);
}

test.rows[1][6] = "2mv9u5fa";
expect("GET with no token is still the health check", get(), { ok: true, service: "wedding-rsvp" });
expect("GET with a malformed token is refused", get("<x>"), { ok: false, error: "bad token" });
expect("GET with an unknown token is refused, not answered with null", get("zzzzzzzz"), { ok: false, error: "unknown token" });

var latest = get("2mv9u5fa");
expect("GET returns the most recent answer, not the first", [latest.ok, latest.answer.attending], [true, "yes"]);
expect("the latest answer carries its note", latest.answer.note.length, 2000);

post({ token: "2mv9u5fa", attending: "yes", events: ["cocktail", "wedding"], note: "second phone" });
latest = get("2mv9u5fa").answer;
expect("events come back as a list of keys", latest.events, ["cocktail", "wedding"]);
expect("the note comes back as sent", latest.note, "second phone");
expect("the time is sent as text, not a Date", typeof latest.received_at, "string");

post({ token: "2mv9u5fa", attending: "no" });
expect("a later no replaces a yes, with no events", [get("2mv9u5fa").answer.attending, get("2mv9u5fa").answer.events], ["no", []]);

expect("each guest gets their own answer, not the test guest's", get("rc66pchc").answer.attending, "no");
pranay.rows.splice(2, 0, ["2", "Never Replied", "1", "1", "", "", "nvr12345", ""]);
expect("a guest with no reply at all gets answer null", get("nvr12345"), { ok: true, answer: null });

// Clearing the test replies by hand must make the invite read as unanswered.
rsvps.rows = rsvps.rows.filter(function (r, i) { return i === 0 || r[1] !== "2mv9u5fa"; });
expect("deleting a guest's rows by hand leaves them unanswered", get("2mv9u5fa"), { ok: true, answer: null });

// Per-event RSVP columns and the note, on a tab shaped like the real one -----

var gridHeader = [
  "S.No", "Name", "Pelli Koduku", "Cocktail", "Confidence Cocktail", "Haldi",
  "Confidence Haldi", "Wedding", "Confidence Wedding", "Token",
  "RSVP Status", "Responded At",
  "RSVP Pelli Koduku", "RSVP Cocktail", "RSVP Haldi", "RSVP Wedding", "RSVP Note",
  "RSVP Changes"
];
var G = {};
gridHeader.forEach(function (h, i) { G[h] = i; });
// Invited as two to the cocktail, one to the wedding, not to Pelli Koduku, and
// with the Haldi marked by a tick rather than a number.
var grid = makeSheet("Grid", [
  gridHeader,
  ["1", "Household", "0", 2, 1, "\u2713", "", "1", "", "grid1234", "", "", "", "", "", "", "", ""]
]);
sheets.unshift(grid);
function cell(name) { return grid.rows[1][G[name]]; }

post({ token: "grid1234", attending: "yes", events: ["cocktail", "wedding"], note: "Both of us!" });
expect("a yes counts the invited head count, not 1", cell("RSVP Cocktail"), 2);
expect("an event invited as 1 counts as 1", cell("RSVP Wedding"), 1);
expect("an invited event they did not tick is 0, not blank", cell("RSVP Haldi"), 0);
expect("an event they were never invited to stays blank", cell("RSVP Pelli Koduku"), "");
expect("the note is copied onto the guest row", cell("RSVP Note"), "Both of us!");
expect("a first answer counts zero changes, not blank", cell("RSVP Changes"), 0);
expect("a Confidence column is never written to", [cell("Confidence Cocktail"), cell("Confidence Wedding")], [1, ""]);
expect("the invite columns themselves are untouched", [cell("Cocktail"), cell("Haldi"), cell("Wedding")], [2, "\u2713", "1"]);

post({ token: "grid1234", attending: "yes", events: ["haldimehendi"] });
expect("changing their mind moves the counts", [cell("RSVP Cocktail"), cell("RSVP Haldi"), cell("RSVP Wedding")], [0, 1, 0]);
expect("an answer with no note clears the old note", cell("RSVP Note"), "");
expect("picking different events counts as one change", cell("RSVP Changes"), 1);

post({ token: "grid1234", attending: "yes", events: ["haldimehendi"] });
expect("sending the same answer again is not a change", cell("RSVP Changes"), 1);
post({ token: "grid1234", attending: "yes", events: ["haldimehendi"], note: "reworded" });
expect("editing only the note is not a change", cell("RSVP Changes"), 1);

post({ token: "grid1234", attending: "no", events: ["cocktail"], note: "So sorry" });
expect("a no zeroes every invited event, whatever was ticked", [cell("RSVP Cocktail"), cell("RSVP Haldi"), cell("RSVP Wedding")], [0, 0, 0]);
expect("a no still keeps its note", cell("RSVP Note"), "So sorry");
expect("status reads no", cell("RSVP Status"), "no");
expect("yes to no counts as another change", cell("RSVP Changes"), 2);

post({ token: "grid1234", attending: "yes", events: ["wedding", "cocktail"] });
post({ token: "grid1234", attending: "yes", events: ["cocktail", "wedding"] });
expect("the same events in a different order are not a change", cell("RSVP Changes"), 3);

expect("head counts follow the importer's rules",
  [headCount(""), headCount(0), headCount("0"), headCount(1.5), headCount("2"), headCount("Yes"), headCount("maybe")],
  [0, 0, 0, 2, 2, 1, 0]);

out.push("");
out.push(failed ? failed + " FAILED" : "all passed");
print(out.join("\n"));
