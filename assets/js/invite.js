(() => {
  // The /exec URL of the Apps Script in tools/invite/rsvp.gs. While it is empty
  // the form says plainly that nothing was sent, rather than faking a success.
  //
  // This URL is public the moment it ships in this file, so the script must
  // treat an unknown token as the only gate on writing to the sheet. Replace an
  // existing deployment rather than creating a new one; a new deployment gets a
  // new URL and silently breaks every invite already sent.
  const RSVP_ENDPOINT = "";

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
  const submitNode = form.querySelector('button[type="submit"]');

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

  // Which events you can make is only a question if you are coming at all.
  function syncEventsVisibility() {
    if (!eventsNode) {
      return;
    }
    eventsNode.hidden = currentAnswer() === "no";
  }

  function collectPayload() {
    const selectedEvents = Array.from(form.querySelectorAll('input[name="events"]:checked'))
      .map((input) => input.value);
    const noteNode = form.querySelector('[name="note"]');
    return {
      token: (form.querySelector("[data-rsvp-token]") || {}).value || "",
      attending: currentAnswer(),
      events: currentAnswer() === "no" ? [] : selectedEvents,
      note: noteNode ? noteNode.value.trim() : ""
    };
  }

  form.addEventListener("change", (event) => {
    if (event.target && event.target.name === "attending") {
      syncEventsVisibility();
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

    if (!payload.token) {
      setStatus("This invite is missing its code. Please send us the link you used.", true);
      return;
    }

    if (!RSVP_ENDPOINT) {
      setStatus("Preview only. Nothing was sent yet.", true);
      return;
    }

    submitNode.disabled = true;
    setStatus("Sending...");

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
        return;
      }

      setStatus(
        payload.attending === "yes"
          ? "Thank you, we cannot wait to see you."
          : "Thank you for letting us know. We will miss you."
      );
      form.querySelectorAll("input, textarea, button").forEach((node) => {
        node.disabled = true;
      });
    } catch (error) {
      submitNode.disabled = false;
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

  syncEventsVisibility();
})();
