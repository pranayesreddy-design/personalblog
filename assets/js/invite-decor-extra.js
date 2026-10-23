// Third decorative layer, on top of invite-decor-plus.js: a mehendi paisley
// that draws itself beside the Haldi & Mehendi card, and a row of diyas in the
// footer that light one by one as the guest reaches the end.
//
// Same rules as the other layers: built here, aria-hidden, no pointer events,
// and nothing in it can change what the RSVP does.
(function () {
  const SVG = "http://www.w3.org/2000/svg";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function el(tag, attrs, parent) {
    const node = document.createElementNS(SVG, tag);
    Object.keys(attrs).forEach((key) => node.setAttribute(key, attrs[key]));
    if (parent) {
      parent.appendChild(node);
    }
    return node;
  }

  function box(className) {
    const node = document.createElement("div");
    node.className = className;
    node.setAttribute("aria-hidden", "true");
    return node;
  }

  function onceVisible(node, threshold, run) {
    if (reducedMotion || !("IntersectionObserver" in window)) {
      run();
      return;
    }
    const watch = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        run();
        watch.disconnect();
      }
    }, { threshold });
    watch.observe(node);
  }

  // Mehendi -------------------------------------------------------------------

  // A paisley with a flower in its belly and a vine trailing from its tip,
  // drawn line by line the way a cone traces it, then dotted.
  function mehendi(slot) {
    const wrap = box("extra-mehendi");
    const svg = el("svg", { viewBox: "0 0 90 120" }, wrap);
    const lines = [
      "M44 112 C14 108 4 76 18 52 C30 32 54 28 62 6 C72 30 80 56 72 80 C66 100 58 112 44 112 Z",
      "M44 100 C24 97 17 76 27 60 C36 46 54 42 60 28 C66 46 69 62 64 78 C60 90 54 100 44 100 Z",
      "M44 80 C38 74 38 66 44 62 C50 66 50 74 44 80 Z",
      "M44 71 C36 76 30 72 30 66 C36 64 41 66 44 71 Z",
      "M44 71 C52 76 58 72 58 66 C52 64 47 66 44 71 Z",
      "M62 6 C70 2 80 6 82 16 C84 26 76 30 72 24 C68 18 74 14 78 18",
    ];
    lines.forEach((d, i) => {
      const path = el("path", { d, pathLength: "1", class: "extra-mehendi-line" }, svg);
      path.style.setProperty("--i", i);
    });
    [[44, 70, 2.6], [32, 88, 1.6], [56, 88, 1.6], [44, 92, 1.6], [26, 66, 1.4], [62, 60, 1.4], [44, 50, 1.4]]
      .forEach(([cx, cy, r], i) => {
        const dot = el("circle", { cx, cy, r, class: "extra-mehendi-dot" }, svg);
        dot.style.setProperty("--i", i);
      });
    slot.classList.add("extra-has-mehendi");
    slot.appendChild(wrap);
    onceVisible(wrap, 0.6, () => wrap.classList.add("is-drawn"));
  }

  // Diyas ---------------------------------------------------------------------

  function diya(parent, index) {
    const svg = el("svg", { viewBox: "0 0 40 44", class: "extra-diya" }, parent);
    svg.style.setProperty("--i", index);
    const flame = el("g", { class: "extra-diya-flame" }, svg);
    el("ellipse", { cx: 20, cy: 18, rx: 7, ry: 9, class: "extra-diya-glow" }, flame);
    el("path", { d: "M20 6 C24 12 25 17 20 22 C15 17 16 12 20 6 Z", class: "extra-diya-fire" }, flame);
    el("path", { d: "M20 12 C22 15 22 18 20 20 C18 18 18 15 20 12 Z", class: "extra-diya-core" }, flame);
    el("path", { d: "M3 24 C6 36 34 36 37 24 C30 27 10 27 3 24 Z", class: "extra-diya-clay" }, svg);
    el("path", { d: "M3 24 C10 27 30 27 37 24", class: "extra-diya-rim" }, svg);
    el("path", { d: "M14 35 C16 40 24 40 26 35", class: "extra-diya-clay" }, svg);
  }

  function diyas(foot) {
    const row = box("extra-diyas");
    const count = window.innerWidth < 700 ? 5 : 7;
    for (let i = 0; i < count; i += 1) {
      diya(row, i);
    }
    const lotus = foot.querySelector(".decor-lotus");
    if (lotus) {
      lotus.after(row);
    } else {
      foot.insertBefore(row, foot.firstChild);
    }
    onceVisible(row, 0.9, () => row.classList.add("is-lit"));
  }

  const haldi = document.querySelector('.slot[data-event-key="haldimehendi"]');
  if (haldi) {
    mehendi(haldi);
  }
  const foot = document.querySelector(".foot .wrap");
  if (foot) {
    diyas(foot);
  }
  document.documentElement.classList.add("extra-on");
})();
