(() => {
  const DEFAULT_BATCH_SIZE = 3;

  // Start filling before the sentinel is actually visible so a scroll never
  // waits on a render.
  const DEFAULT_ROOT_MARGIN = "400px 0px";

  function appendHtml(targetNode, html) {
    const staging = document.createElement("div");
    staging.innerHTML = html;
    while (staging.firstElementChild) {
      targetNode.appendChild(staging.firstElementChild);
    }
  }

  function canObserve(node) {
    return Boolean(node) && "IntersectionObserver" in window;
  }

  // Reveals `items` a batch at a time as `sentinelNode` nears the viewport.
  // Anything that cannot observe renders everything immediately, so a page
  // never ends up with content the reader has no way to reach.
  function mountLazyFeed(options) {
    const settings = options || {};
    const items = Array.isArray(settings.items) ? settings.items : [];
    const batchSize = Math.max(1, Number(settings.batchSize) || DEFAULT_BATCH_SIZE);
    const sentinelNode = settings.sentinelNode;
    const renderItem = typeof settings.renderItem === "function" ? settings.renderItem : null;
    const onBatch = typeof settings.onBatch === "function" ? settings.onBatch : null;
    let nextIndex = 0;

    function hasMore() {
      return nextIndex < items.length;
    }

    function renderNextBatch() {
      const batch = items.slice(nextIndex, nextIndex + batchSize);
      nextIndex += batch.length;
      if (renderItem) {
        batch.forEach(renderItem);
      }
      if (onBatch) {
        onBatch(hasMore());
      }
    }

    function renderAll() {
      while (hasMore()) {
        renderNextBatch();
      }
    }

    if (!items.length) {
      if (onBatch) {
        onBatch(false);
      }
      return { renderAll, hasMore };
    }

    renderNextBatch();

    if (!hasMore()) {
      return { renderAll, hasMore };
    }

    if (!canObserve(sentinelNode)) {
      renderAll();
      return { renderAll, hasMore };
    }

    const observer = new IntersectionObserver((observedEntries) => {
      if (!observedEntries.some((observed) => observed.isIntersecting)) {
        return;
      }

      renderNextBatch();

      if (!hasMore()) {
        observer.disconnect();
        return;
      }

      // The sentinel stays intersecting after a batch is appended, and an
      // unchanged state fires no new callback. Re-observing forces a fresh
      // check so a tall viewport keeps filling instead of stalling.
      observer.unobserve(sentinelNode);
      observer.observe(sentinelNode);
    }, { rootMargin: settings.rootMargin || DEFAULT_ROOT_MARGIN });

    observer.observe(sentinelNode);
    return { renderAll, hasMore };
  }

  // Runs `onReach` once, the first time `targetNode` comes near the viewport.
  // The node must be visible for this to fire, so observe a placeholder rather
  // than a `hidden` container.
  function whenNearViewport(targetNode, onReach, rootMargin) {
    if (typeof onReach !== "function") {
      return;
    }

    if (!canObserve(targetNode)) {
      onReach();
      return;
    }

    const observer = new IntersectionObserver((observedEntries) => {
      if (!observedEntries.some((observed) => observed.isIntersecting)) {
        return;
      }
      observer.disconnect();
      onReach();
    }, { rootMargin: rootMargin || DEFAULT_ROOT_MARGIN });

    observer.observe(targetNode);
  }

  window.LAZY_FEED = {
    mountLazyFeed,
    whenNearViewport,
    appendHtml
  };
})();
