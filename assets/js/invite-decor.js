// Decorative motion for the traditional invite themes: a swaying thoranam and
// falling petals over the hero, a boat crossing a river between the story and
// the schedule, and a lotus that opens in the footer.
//
// All of it is built here rather than in the template, so a page without this
// script is exactly the plain invite, and nothing here can break the RSVP.
// Every element is aria-hidden and pointer-events: none.
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

  // Thoranam: mango leaves alternating with marigold strings, hung from a
  // sagging cord. Each strand sways on its own delay so the line never moves
  // in lockstep.
  //
  // Drawn at the strip's real width rather than one fixed drawing scaled to
  // fit: scaling up to cover a wide screen pushed the leaf tips past the bottom
  // of the strip and cut them off. Wider screens get more strands instead.
  function drawThoranam(wrap) {
    const scale = wrap.clientHeight / 90 || 1;
    const width = Math.ceil(wrap.clientWidth / scale);
    const count = Math.max(8, Math.round(width / 30));
    wrap.textContent = "";
    const svg = el("svg", { viewBox: `0 0 ${width} 90`, preserveAspectRatio: "xMidYMin meet" }, wrap);
    const sag = (x) => 6 + 16 * (1 - Math.pow((x - width / 2) / (width / 2), 2));
    el("path", { d: `M0 6 Q${width / 2} 38 ${width} 6`, class: "decor-cord" }, svg);
    for (let i = 0; i < count; i += 1) {
      const x = (i + 0.5) * (width / count);
      const y = sag(x);
      const strand = el("g", { class: "decor-strand", style: `--i:${i % 7}` }, svg);
      if (i % 2 === 0) {
        el("path", {
          class: "decor-leaf",
          d: `M${x} ${y} C${x + 9} ${y + 13} ${x + 8} ${y + 36} ${x} ${y + 50} C${x - 8} ${y + 36} ${x - 9} ${y + 13} ${x} ${y}Z`
        }, strand);
        el("path", { class: "decor-vein", d: `M${x} ${y + 4}V${y + 46}` }, strand);
      } else {
        for (let k = 0; k < 3; k += 1) {
          el("circle", { class: k % 2 ? "decor-bloom-2" : "decor-bloom-1", cx: x, cy: y + 10 + k * 14, r: 7 }, strand);
        }
      }
    }
  }

  function thoranam(hero) {
    const wrap = box("decor-toran");
    hero.appendChild(wrap);
    drawThoranam(wrap);
    let lastWidth = wrap.clientWidth;
    let pending = 0;
    window.addEventListener("resize", () => {
      clearTimeout(pending);
      pending = setTimeout(() => {
        if (wrap.clientWidth !== lastWidth) {
          lastWidth = wrap.clientWidth;
          drawThoranam(wrap);
        }
      }, 150);
    });
  }

  function petals(hero) {
    if (reducedMotion) {
      return;
    }
    const field = box("decor-petals");
    const count = window.innerWidth < 700 ? 12 : 20;
    for (let i = 0; i < count; i += 1) {
      const petal = document.createElement("span");
      petal.className = i % 3 === 0 ? "decor-petal decor-petal--alt" : "decor-petal";
      petal.style.setProperty("--x", `${Math.random() * 100}%`);
      petal.style.setProperty("--size", `${10 + Math.random() * 9}px`);
      petal.style.setProperty("--fall", `${10 + Math.random() * 8}s`);
      petal.style.setProperty("--delay", `${-Math.random() * 18}s`);
      petal.style.setProperty("--drift", `${(Math.random() - 0.5) * 160}px`);
      petal.style.setProperty("--spin", `${Math.random() > 0.5 ? 1 : -1}`);
      field.appendChild(petal);
    }
    hero.appendChild(field);
  }

  // Waves are one long path in two layers moving at different speeds, shifted
  // by exactly one repeat so the loop has no seam.
  function wavePath(width, period, amp, base) {
    let d = `M0 ${base}`;
    for (let x = 0; x < width; x += period) {
      d += ` q${period / 4} ${-amp} ${period / 2} 0 t${period / 2} 0`;
    }
    return `${d} V120 H0 Z`;
  }

  function river(after) {
    const strip = box("decor-river");
    const back = el("svg", { class: "decor-waves decor-waves--back", viewBox: "0 0 2400 120", preserveAspectRatio: "none" }, strip);
    el("path", { d: wavePath(2400, 80, 7, 70) }, back);

    const boat = box("decor-boat");
    const svg = el("svg", { viewBox: "0 0 140 80" }, boat);
    el("path", { class: "decor-oar", d: "M104 30 L126 74" }, svg);
    el("path", { class: "decor-canopy", d: "M40 46 C44 22 92 22 98 46 Z" }, svg);
    el("path", { class: "decor-canopy-line", d: "M52 44 C56 30 84 30 88 44" }, svg);
    el("path", { class: "decor-hull", d: "M6 44 C20 50 116 50 134 40 C126 60 102 66 70 66 C38 66 16 60 6 44 Z" }, svg);
    el("path", { class: "decor-hull-line", d: "M14 50 C40 58 104 58 126 48" }, svg);
    strip.appendChild(boat);

    const front = el("svg", { class: "decor-waves decor-waves--front", viewBox: "0 0 2400 120", preserveAspectRatio: "none" }, strip);
    el("path", { d: wavePath(2400, 120, 9, 86) }, front);
    after.insertAdjacentElement("afterend", strip);
  }

  function lotus(foot) {
    const wrap = box("decor-lotus");
    const svg = el("svg", { viewBox: "-60 -70 120 80" }, wrap);
    const petalPath = "M0 0 C-12 -16 -10 -40 0 -56 C10 -40 12 -16 0 0 Z";
    [-64, -32, 32, 64, -16, 16, 0].forEach((angle, i) => {
      el("path", {
        d: petalPath,
        class: i < 4 ? "decor-lotus-outer" : "decor-lotus-inner",
        style: `--a:${angle}deg; --i:${i}`
      }, svg);
    });
    el("path", { class: "decor-lotus-pad", d: "M-46 4 C-30 12 30 12 46 4 C30 0 -30 0 -46 4 Z" }, svg);
    foot.insertBefore(wrap, foot.firstChild);

    if (reducedMotion || !("IntersectionObserver" in window)) {
      wrap.classList.add("is-open");
      return;
    }
    const watch = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          wrap.classList.add("is-open");
          watch.disconnect();
        }
      });
    }, { threshold: 0.6 });
    watch.observe(wrap);
  }

  const hero = document.querySelector(".hero");
  if (hero) {
    if (document.body.dataset.decorToran !== "off") {
      thoranam(hero);
    }
    petals(hero);
  }
  const story = document.getElementById("story");
  if (story) {
    river(story);
  }
  const foot = document.querySelector(".foot .wrap");
  if (foot) {
    lotus(foot);
  }
  document.documentElement.classList.add("decor-on");
})();
