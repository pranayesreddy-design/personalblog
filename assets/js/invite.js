(() => {
  // The /exec URL of the Apps Script in tools/invite/rsvp.gs. While it is empty
  // the form says plainly that nothing was sent, rather than faking a success.
  //
  // This URL is public the moment it ships in this file, so the script must
  // treat an unknown token as the only gate on writing to the sheet. Replace an
  // existing deployment rather than creating a new one; a new deployment gets a
  // new URL and silently breaks every invite already sent.
  const RSVP_ENDPOINT =
    "https://script.google.com/macros/s/AKfycbyi9_FWTguAxE3EM3Ik3f2WWh_pJFJSUbdAJK8ud1La40zIRfeEARk-uMvohGGQ3pBKnA/exec";

  // Reveal on scroll ------------------------------------------------------

  function revealAll(nodes) {
    nodes.forEach((node) => node.classList.add("is-visible"));
  }

  function setupReveals() {
    const nodes = Array.from(document.querySelectorAll("[data-reveal]"));
    if (!nodes.length) {
      return;
    }

    const reducedMotion = window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion || !("IntersectionObserver" in window)) {
      revealAll(nodes);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        entry.target.classList.add("is-visible");
        // One-way: nothing re-hides on the way back up, which would feel
        // broken when a guest scrolls to re-read a venue.
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });

    nodes.forEach((node) => observer.observe(node));

    // Anything already on screen at load should not wait for a scroll that may
    // never come on a short viewport.
    requestAnimationFrame(() => {
      nodes.forEach((node) => {
        const box = node.getBoundingClientRect();
        if (box.top < window.innerHeight && box.bottom > 0) {
          node.classList.add("is-visible");
          observer.unobserve(node);
        }
      });
    });
  }

  setupReveals();

  // Countdown --------------------------------------------------------------

  function setupCountdown() {
    const node = document.querySelector("[data-countdown]");
    const raw = document.body.dataset.weddingDate;
    if (!node || !raw) {
      return;
    }

    const parts = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!parts) {
      return;
    }

    // Compare whole local days so the number does not tick over at an odd hour
    // or shift with the guest's timezone.
    const wedding = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((wedding - today) / 86400000);

    if (days > 1) {
      node.textContent = `${days} days to go`;
    } else if (days === 1) {
      node.textContent = "Tomorrow";
    } else if (days === 0) {
      node.textContent = "Today";
    }
  }

  setupCountdown();

  // RSVP ------------------------------------------------------------------

  const form = document.querySelector("[data-rsvp-form]");
  if (!form) {
    return;
  }

  const statusNode = form.querySelector("[data-rsvp-status]");
  const eventsNode = form.querySelector("[data-rsvp-events]");
  const restNode = form.querySelector("[data-rsvp-rest]");
  const submitNode = form.querySelector('button[type="submit"]');
  const submitLabel = submitNode ? submitNode.textContent : "";
  const doneNode = document.querySelector("[data-rsvp-done]");
  // A guest invited to one event never sees the list: a single box to tick
  // asks the same question twice. Their yes is a yes to that event.
  const eventInputs = form.querySelectorAll('input[name="events"]');
  const onlyEvent = eventInputs.length === 1 ? eventInputs[0].value : "";
  const token = (form.querySelector("[data-rsvp-token]") || {}).value || "";
  // Per token, so two guests sharing a phone each see their own answer.
  const storageKey = `rsvp:${token}`;

  function remember(answer) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(answer));
    } catch (error) {
      // Private browsing can refuse storage. The answer is already saved on
      // the server, so losing the local copy only costs the summary on return.
    }
  }

  function recall() {
    try {
      const answer = JSON.parse(localStorage.getItem(storageKey) || "null");
      return answer && (answer.attending === "yes" || answer.attending === "no") ? answer : null;
    } catch (error) {
      return null;
    }
  }

  // Name and day straight from the checkbox label, so the summary can never
  // describe an event differently from the list the guest just ticked.
  function describeEvent(key) {
    const input = form.querySelector(`input[name="events"][value="${key}"]`);
    const label = input && input.closest("label");
    if (!label) {
      return null;
    }
    const span = label.querySelector("span");
    const when = span && span.querySelector(".rsvp-when");
    const name = span ? Array.from(span.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join("")
      .trim() : key;
    return { name, when: when ? when.textContent.trim() : "" };
  }

  function showDone(answer, justSent) {
    if (!doneNode) {
      return;
    }
    const title = doneNode.querySelector("[data-rsvp-done-title]");
    const list = doneNode.querySelector("[data-rsvp-done-list]");
    const note = doneNode.querySelector("[data-rsvp-done-note]");

    title.textContent = answer.attending === "yes"
      ? "Yay! See you there."
      : "We'll miss you. Thanks for telling us.";

    list.textContent = "";
    if (answer.attending === "yes") {
      answer.events.forEach((key) => {
        const event = describeEvent(key);
        if (!event) {
          return;
        }
        const item = document.createElement("li");
        const name = document.createElement("strong");
        name.textContent = event.name;
        item.appendChild(name);
        if (event.when) {
          const when = document.createElement("span");
          when.textContent = event.when;
          item.appendChild(when);
        }
        list.appendChild(item);
      });
    }
    list.hidden = !list.children.length;

    note.hidden = !answer.note;
    note.textContent = answer.note ? `Your note: ${answer.note}` : "";

    form.hidden = true;
    doneNode.hidden = false;
    // Only straight after sending. On a return visit the page must open at the
    // top as usual, not jump past the invite to a summary.
    if (justSent) {
      // Moves screen readers to the result, and on a phone brings it into view
      // instead of leaving the guest looking at the space the form used to fill.
      doneNode.focus({ preventScroll: true });
      doneNode.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function restore(answer) {
    const radio = form.querySelector(`input[name="attending"][value="${answer.attending}"]`);
    if (radio) {
      radio.checked = true;
    }
    form.querySelectorAll('input[name="events"]').forEach((input) => {
      input.checked = answer.events.indexOf(input.value) !== -1;
    });
    const noteNode = form.querySelector('[name="note"]');
    if (noteNode) {
      noteNode.value = answer.note || "";
    }
    syncEventsVisibility();
  }

  function setStatus(message, isWarning) {
    if (!statusNode) {
      return;
    }
    statusNode.textContent = message;
    statusNode.classList.toggle("rsvp-status--warn", Boolean(isWarning));
  }

  function currentAnswer() {
    const checked = form.querySelector('input[name="attending"]:checked');
    return checked ? checked.value : "";
  }

  // The form opens as just the two answer buttons and unfolds from there:
  // events only for a yes, then the note and Send for either answer. Asking
  // everything up front made the section read like a form to fill in rather
  // than a question to answer.
  function syncEventsVisibility() {
    const answer = currentAnswer();
    if (eventsNode) {
      eventsNode.hidden = answer !== "yes" || Boolean(onlyEvent);
    }
    if (restNode) {
      restNode.hidden = !answer;
    }
  }

  function collectPayload() {
    const selectedEvents = onlyEvent ? [onlyEvent] : Array.from(form.querySelectorAll('input[name="events"]:checked'))
      .map((input) => input.value);
    const noteNode = form.querySelector('[name="note"]');
    return {
      token,
      attending: currentAnswer(),
      events: currentAnswer() === "no" ? [] : selectedEvents,
      note: noteNode ? noteNode.value.trim() : ""
    };
  }

  let touched = false;
  form.addEventListener("input", () => {
    touched = true;
  });

  form.addEventListener("change", (event) => {
    touched = true;
    const target = event.target;
    if (!target) {
      return;
    }
    if (target.name === "attending") {
      syncEventsVisibility();
      setStatus("");
    }
    if (target.name === "events") {
      setStatus("");
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = collectPayload();

    if (!payload.attending) {
      setStatus("Let us know if you can make it.", true);
      return;
    }

    // A yes with nothing ticked tells us nothing about which days to plan for.
    const hasEvents = form.querySelector('input[name="events"]');
    if (payload.attending === "yes" && hasEvents && !payload.events.length) {
      setStatus("Tick at least one, so we know when to expect you.", true);
      return;
    }

    if (!payload.token) {
      setStatus("This invite is missing its code. Please send us the link you used.", true);
      return;
    }

    if (!RSVP_ENDPOINT) {
      setStatus("Preview only. Nothing was sent yet.", true);
      return;
    }

    submitNode.disabled = true;
    submitNode.textContent = "Sending...";
    setStatus("");

    try {
      const response = await fetch(RSVP_ENDPOINT, {
        method: "POST",
        // Apps Script has no doOptions and cannot send CORS headers, so this
        // has to stay a "simple" request. text/plain carrying a JSON string
        // skips the preflight; application/json would fail with a 405 on the
        // OPTIONS it never answers.
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        // Apps Script answers /exec with a redirect to googleusercontent.
        redirect: "follow",
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`RSVP failed with ${response.status}`);
      }

      const result = await response.json();
      if (!result.ok) {
        // The server reached a decision and refused, so retrying will not
        // help. An unrecognised code is the likely one and needs a human.
        setStatus(
          result.error === "unknown token"
            ? "We could not match this invite to our list. Please send us the link you used."
            : "Something was wrong with that submission. Please text us and we will sort it out.",
          true
        );
        submitNode.disabled = false;
        submitNode.textContent = submitLabel;
        return;
      }

      const answer = {
        attending: payload.attending,
        events: payload.events,
        note: payload.note
      };
      remember(answer);
      submitNode.disabled = false;
      submitNode.textContent = submitLabel;
      setStatus("");
      showDone(answer, true);
    } catch (error) {
      submitNode.disabled = false;
      submitNode.textContent = submitLabel;
      // The request may well have been stored before the failure: a blocked
      // cross-origin read looks identical to a dropped connection from here.
      // Claiming it failed outright would invite a duplicate submission, so
      // say what is actually known.
      setStatus(
        "We could not confirm that was saved. Please text us rather than sending it twice.",
        true
      );
    }
  });

  if (doneNode) {
    doneNode.querySelector("[data-rsvp-change]").addEventListener("click", () => {
      touched = true;
      const answer = recall();
      if (answer) {
        restore(answer);
      }
      doneNode.hidden = true;
      form.hidden = false;
      setStatus("");
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function showForm() {
    if (doneNode) {
      doneNode.hidden = true;
    }
    form.hidden = false;
  }

  // The sheet is the record, so ask it. The copy on this phone only exists to
  // paint the summary instantly and to cover a failed lookup; without the
  // lookup, an answer sent from a laptop was invisible on the guest's phone.
  async function fetchSaved() {
    if (!RSVP_ENDPOINT || !token) {
      return;
    }
    let result;
    try {
      const response = await fetch(`${RSVP_ENDPOINT}?token=${encodeURIComponent(token)}`, {
        redirect: "follow"
      });
      if (!response.ok) {
        return;
      }
      result = await response.json();
    } catch (error) {
      // Offline or blocked. Whatever this phone remembers is the best we have.
      return;
    }
    if (!result || !result.ok || !("answer" in result)) {
      return;
    }
    // A slow lookup must never yank the guest out of an edit they have
    // already started, including one begun with "Change my answer".
    if (touched) {
      return;
    }
    const saved = result.answer;
    if (saved && (saved.attending === "yes" || saved.attending === "no")) {
      const answer = {
        attending: saved.attending,
        events: Array.isArray(saved.events) ? saved.events : [],
        note: saved.note || ""
      };
      remember(answer);
      restore(answer);
      showDone(answer, false);
    } else if (recall()) {
      // The sheet has nothing for this invite, so a summary from this phone
      // would describe an answer we do not have. Most likely the row was
      // cleared on purpose, as with test replies. Show the form again.
      try {
        localStorage.removeItem(storageKey);
      } catch (error) {
        // Nothing to clean up if storage is unavailable.
      }
      form.reset();
      syncEventsVisibility();
      showForm();
    }
  }

  syncEventsVisibility();

  const previous = recall();
  if (previous) {
    restore(previous);
    showDone(previous, false);
  }
  fetchSaved();
})();
