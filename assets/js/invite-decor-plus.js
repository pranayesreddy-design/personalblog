// Second decorative layer, on top of invite-decor.js: elephants under the
// names, banana-tree pillars and temple bells on the cover, kolam dividers that
// draw themselves, and a talambralu shower when a guest says yes.
//
// Same rules as the first layer: built here, aria-hidden, no pointer events,
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

  // Elephants ---------------------------------------------------------------

  // Drawn facing right in a 100x80 box; the left one is the same drawing
  // mirrored, so the pair always match.
  function elephant(parent, mirrored) {
    const g = el("g", { transform: mirrored ? "translate(100 0) scale(-1 1)" : "" }, parent);
    el("path", { class: "plus-ele-body", d: "M12 40 C6 46 6 54 8 58", fill: "none", "stroke-width": 2.5 }, g);
    el("ellipse", { class: "plus-ele", cx: 42, cy: 44, rx: 30, ry: 20 }, g);
    [18, 30, 50, 61].forEach((x) => el("rect", { class: "plus-ele", x, y: 52, width: 9, height: 22, rx: 3 }, g));
    el("path", { class: "plus-cloth", d: "M27 27 C38 22 52 22 61 28 L59 51 C48 57 35 57 26 51 Z" }, g);
    [32, 40, 48, 56].forEach((x) => el("circle", { class: "plus-cloth-dot", cx: x, cy: 53, r: 1.6 }, g));
    el("circle", { class: "plus-ele", cx: 72, cy: 34, r: 15 }, g);
    el("ellipse", { class: "plus-ele-ear", cx: 65, cy: 37, rx: 8, ry: 11 }, g);
    el("path", { class: "plus-crown", d: "M65 21 L72 12 L79 21 Z" }, g);
    const trunk = el("g", { class: "plus-trunk" }, g);
    el("path", { class: "plus-ele-body", d: "M82 40 C92 44 97 30 93 18 C91 12 96 8 99 12", fill: "none", "stroke-width": 7, "stroke-linecap": "round" }, trunk);
    el("path", { class: "plus-tusk", d: "M80 45 C85 49 90 47 92 44", fill: "none", "stroke-width": 2.2, "stroke-linecap": "round" }, g);
    el("circle", { class: "plus-eye", cx: 76, cy: 30, r: 1.6 }, g);
  }

  function kalasam(parent) {
    const g = el("g", { transform: "translate(110 0)" }, parent);
    [-26, -12, 12, 26].forEach((angle) => {
      el("path", { class: "plus-mango", d: "M20 30 C14 20 16 8 20 0 C24 8 26 20 20 30 Z", transform: `rotate(${angle} 20 30)` }, g);
    });
    el("circle", { class: "plus-coconut", cx: 20, cy: 28, r: 8 }, g);
    el("rect", { class: "plus-pot", x: 13, y: 34, width: 14, height: 6, rx: 2 }, g);
    el("path", { class: "plus-pot", d: "M8 52 C8 42 32 42 32 52 C32 66 8 66 8 52 Z" }, g);
    el("path", { class: "plus-pot-band", d: "M9 52 H31", "stroke-width": 2 }, g);
  }

  function elephants(hero) {
    const countdown = hero.querySelector("[data-countdown]");
    const wrap = box("plus-elephants");
    const svg = el("svg", { viewBox: "0 0 260 80" }, wrap);
    elephant(el("g", {}, svg), false);
    kalasam(svg);
    elephant(el("g", { transform: "translate(160 0)" }, svg), true);
    hero.insertBefore(wrap, countdown || null);
  }

  // Banana trees --------------------------------------------------------------

  // Tied either side of the entrance at a Telugu wedding. Each leaf sways on
  // its own, rooted where it meets the trunk.
  function bananaTree(side) {
    const wrap = box(`plus-banana plus-banana--${side}`);
    const svg = el("svg", { viewBox: "0 0 120 400", preserveAspectRatio: "xMidYMax meet" }, wrap);
    el("path", { class: "plus-trunk-fill", d: "M52 400 C50 300 54 200 58 120 L66 120 C68 200 70 300 72 400 Z" }, svg);
    el("path", { class: "plus-trunk-line", d: "M60 396 C59 300 61 210 62 126", fill: "none" }, svg);
    const leaves = [
      { a: -62, len: 120 }, { a: -30, len: 135 }, { a: 0, len: 120 }, { a: 28, len: 135 }, { a: 58, len: 118 }, { a: 85, len: 95 }
    ];
    leaves.forEach((leaf, i) => {
      // The angle is an attribute on the outer group and the sway a CSS
      // animation on the inner one; on the same element the CSS would win.
      const outer = el("g", { transform: `rotate(${leaf.a} 62 124)` }, svg);
      const g = el("g", { class: "plus-leaf", style: `--i:${i}` }, outer);
      const tip = 124 - leaf.len;
      el("path", { class: "plus-leaf-fill", d: `M62 124 C40 ${tip + 70} 46 ${tip + 20} 62 ${tip} C78 ${tip + 20} 84 ${tip + 70} 62 124 Z` }, g);
      el("path", { class: "plus-leaf-rib", d: `M62 122 L62 ${tip + 4}`, fill: "none" }, g);
    });
    el("path", { class: "plus-banana-flower", d: "M72 150 C82 160 82 180 74 192 C66 182 66 160 72 150 Z" }, svg);
    return wrap;
  }

  // Bells --------------------------------------------------------------------

  // A temple bell on a chain each side of the cover. They idle in a slow sway
  // and swing harder when the page scrolls, settling back like a pendulum.
  function bells(hero) {
    const nodes = ["left", "right"].map((side) => {
      const wrap = box(`plus-bell plus-bell--${side}`);
      const svg = el("svg", { viewBox: "0 0 40 120" }, wrap);
      const g = el("g", { class: "plus-bell-swing" }, svg);
      for (let y = 4; y < 62; y += 8) {
        el("ellipse", { class: "plus-chain", cx: 20, cy: y, rx: 2.6, ry: 3.6 }, g);
      }
      el("path", { class: "plus-bell-body", d: "M20 62 C11 62 9 74 9 86 C9 94 5 98 3 102 H37 C35 98 31 94 31 86 C31 74 29 62 20 62 Z" }, g);
      el("rect", { class: "plus-bell-rim", x: 2, y: 101, width: 36, height: 4, rx: 2 }, g);
      el("circle", { class: "plus-bell-clapper", cx: 20, cy: 110, r: 4.5 }, g);
      el("circle", { class: "plus-bell-knob", cx: 20, cy: 62, r: 3.5 }, g);
      hero.appendChild(wrap);
      return g;
    });
    if (reducedMotion) {
      return;
    }

    let angle = 0;
    let speed = 0;
    let lastY = window.scrollY;
    const start = performance.now();

    function frame(now) {
      const idle = Math.sin((now - start) / 900) * 2.5;
      speed += -angle * 0.06;
      speed *= 0.92;
      angle += speed;
      const total = angle + idle;
      nodes.forEach((g, i) => {
        g.style.transform = `rotate(${i ? -total : total}deg)`;
      });
      requestAnimationFrame(frame);
    }

    window.addEventListener("scroll", () => {
      const y = window.scrollY;
      speed += Math.max(-4, Math.min(4, (y - lastY) * 0.08));
      lastY = y;
    }, { passive: true });

    requestAnimationFrame(frame);
  }

  // Kolam dividers -------------------------------------------------------------

  // A four-petal loop inside a diamond, the centre of a pulli kolam, with a
  // dotted line running out either side. Traced from the centre outwards when
  // it scrolls into view. The theme's still divider is switched off on these
  // pages, so there is one divider, not two.
  function kolamDivider(section) {
    const wrap = box("plus-kolam");
    const svg = el("svg", { viewBox: "0 0 220 44" }, wrap);
    const line = (d, extra) => el("path", { class: `plus-kolam-line ${extra || ""}`, d, pathLength: 1 }, svg);
    line("M110 22 C100 4 120 4 110 22 C128 12 128 32 110 22 C120 40 100 40 110 22 C92 32 92 12 110 22");
    line("M110 1 L131 22 L110 43 L89 22 Z", "plus-kolam-line--late");
    line("M84 22 H12", "plus-kolam-line--side");
    line("M136 22 H208", "plus-kolam-line--side");
    const dots = [[110, 22], [97, 9], [123, 9], [123, 35], [97, 35], [64, 22], [156, 22], [40, 22], [180, 22], [12, 22], [208, 22]];
    dots.forEach(([x, y], i) => el("circle", { class: "plus-kolam-dot", cx: x, cy: y, r: i ? 2.2 : 2.8, style: `--i:${i}` }, svg));
    section.insertBefore(wrap, section.firstChild);
    onceVisible(wrap, 0.5, () => wrap.classList.add("is-drawn"));
  }

  // Talambralu ---------------------------------------------------------------

  // Rice and petals showered over the couple at the wedding; here, over the
  // guest who has just said yes.
  function talambralu() {
    if (reducedMotion) {
      return;
    }
    const layer = box("plus-shower");
    const count = window.innerWidth < 700 ? 70 : 120;
    for (let i = 0; i < count; i += 1) {
      const bit = document.createElement("span");
      const kind = Math.random();
      bit.className = kind < 0.72 ? "plus-rice" : kind < 0.88 ? "plus-rice plus-rice--petal" : "plus-rice plus-rice--petal-2";
      bit.style.setProperty("--x", `${Math.random() * 100}%`);
      bit.style.setProperty("--drift", `${(Math.random() - 0.5) * 120}px`);
      bit.style.setProperty("--spin", `${(Math.random() - 0.5) * 900}deg`);
      // Scattered starting heights, so the shower arrives as a cloud rather
      // than one line of grains crossing the screen together.
      bit.style.setProperty("--top", `${-2 - Math.random() * 45}vh`);
      bit.style.setProperty("--fall", `${2.2 + Math.random() * 1.6}s`);
      bit.style.setProperty("--delay", `${Math.random() * 0.8}s`);
      layer.appendChild(bit);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 5000);
  }

  document.addEventListener("invite:rsvp-sent", (event) => {
    if (event.detail && event.detail.attending === "yes") {
      talambralu();
    }
  });

  const hero = document.querySelector(".hero");
  if (hero) {
    elephants(hero);
    hero.appendChild(bananaTree("left"));
    hero.appendChild(bananaTree("right"));
    bells(hero);
  }
  // Not where the river already marks the break: two dividers on one
  // boundary collide.
  document.querySelectorAll(".split").forEach((section) => {
    const before = section.previousElementSibling;
    if (!(before && before.classList.contains("decor-river"))) {
      kolamDivider(section);
    }
  });
  document.documentElement.classList.add("plus-on");
})();
