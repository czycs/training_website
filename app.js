const EXERCISE_DIR_PATH = "./data/exercises/";
const DATA_INDEX_PATH = `${EXERCISE_DIR_PATH}index.json`;
const VISUAL_DIR_PATH = "./data/visual/";
const DEFAULT_VISUAL_PATH = `${VISUAL_DIR_PATH}placeholder.svg`;
const DEFAULT_EXERCISE_DATE_ISO = "2025-07-01";

const state = {
  exercises: [],
  selectedAgeGroups: new Set(),
  selectedTags: new Set(),
  tagMatchMode: "any",
  currentExerciseSlug: "",
  searchTerm: "",
  complexityMin: null,
  complexityMax: null,
  intensityMin: null,
  intensityMax: null,
  dateMin: "",
  dateMax: "",
  playersMin: null,
  playersMax: null,
  gksMin: null,
  gksMax: null,
  cardMediaObserver: null,
  activeCardMediaSyncTimer: null,
};

const dom = {
  searchInput: document.querySelector("#searchInput"),
  ageGroupFilters: document.querySelector("#ageGroupFilters"),
  complexityMin: document.querySelector("#complexityMin"),
  complexityMax: document.querySelector("#complexityMax"),
  intensityMin: document.querySelector("#intensityMin"),
  intensityMax: document.querySelector("#intensityMax"),
  dateMin: document.querySelector("#dateMin"),
  dateMax: document.querySelector("#dateMax"),
  tagMatchToggle: document.querySelector("#tagMatchToggle"),
  tagFilters: document.querySelector("#tagFilters"),
  playersMin: document.querySelector("#playersMin"),
  playersMax: document.querySelector("#playersMax"),
  gksMin: document.querySelector("#gksMin"),
  gksMax: document.querySelector("#gksMax"),
  resultCount: document.querySelector("#resultCount"),
  loadStatus: document.querySelector("#loadStatus"),
  exerciseGrid: document.querySelector("#exerciseGrid"),
  resetFilters: document.querySelector("#resetFilters"),
  modal: document.querySelector("#exerciseModal"),
  closeModal: document.querySelector("#closeModal"),
  modalContent: document.querySelector("#modalContent"),
};

bootstrap();

async function bootstrap() {
  state.exercises = ensureUniqueExerciseSlugs(dedupeById(await loadSeededExercises()));
  wireEvents();
  renderFilterChips();
  render();
  syncExerciseFromUrl();
}

async function loadSeededExercises() {
  try {
    const files = await getExerciseFileList();
    const results = await Promise.allSettled(
      files.map(async (fileName) => {
        const res = await fetch(`${EXERCISE_DIR_PATH}${fileName}`);
        if (!res.ok) {
          throw new Error(`Failed to load ${fileName}: ${res.status}`);
        }
        const raw = await res.text();
        return parseExerciseMarkdown(raw, fileName);
      })
    );
    const exercises = results
      .filter((result) => result.status === "fulfilled" && result.value)
      .map((result) => result.value);
    const failed = results.length - exercises.length;
    if (dom.loadStatus) {
      dom.loadStatus.textContent = failed > 0 ? `${exercises.length} drills loaded, ${failed} skipped` : `${exercises.length} drills loaded`;
    }
    return exercises;
  } catch (error) {
    console.error("Could not load seeded exercises.", error);
    if (dom.loadStatus) {
      dom.loadStatus.textContent = "Could not load drills";
    }
    return [];
  }
}

async function getExerciseFileList() {
  const [indexFiles, discoveredFiles] = await Promise.all([
    readIndexJsonFileList(),
    discoverMarkdownFilesFromDirectory(),
  ]);
  const merged = Array.from(new Set([...indexFiles, ...discoveredFiles]));
  return merged.filter((name) => name.toLowerCase().endsWith(".md"));
}

async function readIndexJsonFileList() {
  try {
    const indexRes = await fetch(DATA_INDEX_PATH);
    if (!indexRes.ok) {
      return [];
    }
    const files = await indexRes.json();
    if (!Array.isArray(files)) {
      return [];
    }
    return files.map((name) => String(name).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function discoverMarkdownFilesFromDirectory() {
  try {
    const listingRes = await fetch(EXERCISE_DIR_PATH);
    if (!listingRes.ok) {
      return [];
    }
    const html = await listingRes.text();
    const matches = html.matchAll(/href\s*=\s*["']([^"']+\.md)["']/gi);
    const files = [];

    for (const match of matches) {
      const rawHref = match[1];
      const decoded = decodeURIComponent(rawHref).split("?")[0].split("#")[0];
      const filename = decoded.split("/").pop();
      if (filename && filename.toLowerCase() !== "index.json") {
        files.push(filename);
      }
    }

    return Array.from(new Set(files));
  } catch {
    return [];
  }
}

function wireEvents() {
  dom.searchInput.addEventListener("input", (event) => {
    state.searchTerm = event.target.value.trim().toLowerCase();
    render();
  });

  dom.playersMin.addEventListener("input", (event) => {
    state.playersMin = toNumOrNull(event.target.value);
    render();
  });

  dom.complexityMin.addEventListener("input", (event) => {
    state.complexityMin = clampComplexity(event.target.value);
    render();
  });

  dom.complexityMax.addEventListener("input", (event) => {
    state.complexityMax = clampComplexity(event.target.value);
    render();
  });

  dom.intensityMin.addEventListener("input", (event) => {
    state.intensityMin = clampComplexity(event.target.value);
    render();
  });

  dom.intensityMax.addEventListener("input", (event) => {
    state.intensityMax = clampComplexity(event.target.value);
    render();
  });

  dom.dateMin.addEventListener("input", (event) => {
    state.dateMin = normalizeDateInput(event.target.value);
    render();
  });

  dom.dateMax.addEventListener("input", (event) => {
    state.dateMax = normalizeDateInput(event.target.value);
    render();
  });

  dom.playersMax.addEventListener("input", (event) => {
    state.playersMax = toNumOrNull(event.target.value);
    render();
  });

  dom.gksMin.addEventListener("input", (event) => {
    state.gksMin = toNumOrNull(event.target.value);
    render();
  });

  dom.gksMax.addEventListener("input", (event) => {
    state.gksMax = toNumOrNull(event.target.value);
    render();
  });

  dom.tagMatchToggle.addEventListener("click", () => {
    state.tagMatchMode = state.tagMatchMode === "any" ? "all" : "any";
    renderTagMatchToggle();
    render();
  });

  dom.resetFilters.addEventListener("click", resetFilters);

  dom.closeModal.addEventListener("click", () => closeModalAndClearUrl());
  dom.modal.addEventListener("click", (event) => {
    if (event.target === dom.modal) {
      closeModalAndClearUrl();
    }
  });
  dom.exerciseGrid.addEventListener("scroll", scheduleActiveCardMediaSync, { passive: true });
  window.addEventListener("resize", scheduleActiveCardMediaSync, { passive: true });
  window.addEventListener("hashchange", syncExerciseFromUrl);
}

function renderFilterChips() {
  const ageGroups = uniqueValues(state.exercises.flatMap((item) => item.ageGroups));
  const customTags = uniqueValues(state.exercises.flatMap((item) => item.tags));

  renderChipSet(dom.ageGroupFilters, ageGroups, state.selectedAgeGroups, () => render());
  renderChipSet(dom.tagFilters, customTags, state.selectedTags, () => render());
  renderTagMatchToggle();
}

function renderChipSet(container, values, selectedSet, onToggle) {
  container.innerHTML = "";
  values.forEach((value) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip ${selectedSet.has(value) ? "active" : ""}`;
    button.textContent = value;
    button.addEventListener("click", () => {
      if (selectedSet.has(value)) {
        selectedSet.delete(value);
      } else {
        selectedSet.add(value);
      }
      renderChipSet(container, values, selectedSet, onToggle);
      onToggle();
    });
    container.appendChild(button);
  });
}

function renderTagMatchToggle() {
  dom.tagMatchToggle.textContent =
    state.tagMatchMode === "all" ? "Require all selected tags" : "Match any selected tag";
}

function render() {
  const filtered = state.exercises.filter(matchesFilters);
  dom.resultCount.textContent = `${filtered.length} ${filtered.length === 1 ? "drill" : "drills"}`;
  renderCards(filtered);
  setupVisibleCardMedia();
}

function renderCards(items) {
  dom.exerciseGrid.innerHTML = "";

  if (!items.length) {
    dom.exerciseGrid.innerHTML = `
      <div class="empty-state">
        No exercises match your current filters. Try clearing some filters.
      </div>
    `;
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "card";
    card.id = item.slug;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Open details for ${item.title}`);
    card.addEventListener("click", () => openModal(item));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openModal(item);
      }
    });

    const media = renderMedia(item, "card-media");
    const body = document.createElement("div");
    body.className = "card-body";
    body.innerHTML = `
      <h4>${escapeHtml(item.title)}</h4>
      <p class="meta-line">Date: ${item.displayDate}</p>
      <p class="meta-line">Age: ${escapeHtml(item.ageGroups.join(", ") || "Any")}</p>
      <p class="meta-line">Complexity: ${item.complexity}/10</p>
      <p class="meta-line">Intensity: ${item.intensity}/10</p>
      <p class="meta-line">Players: ${item.players} | GKs: ${item.gks}</p>
      <div class="tag-row">${item.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
    `;
    card.append(media, body);
    dom.exerciseGrid.appendChild(card);
  });
}

function openModal(item) {
  state.currentExerciseSlug = item.slug;
  updateUrlForExercise(item.slug);
  const media = renderMedia(item, "detail-media");
  dom.modalContent.innerHTML = "";
  dom.modalContent.appendChild(media);

  const details = document.createElement("section");
  details.innerHTML = `
    <h2>${escapeHtml(item.title)}</h2>
    <p class="meta-line"><strong>Date:</strong> ${item.displayDate}</p>
    <p class="meta-line"><strong>Age Group:</strong> ${escapeHtml(item.ageGroups.join(", ") || "Any")}</p>
    <p class="meta-line"><strong>Complexity:</strong> ${item.complexity}/10</p>
    <p class="meta-line"><strong>Intensity:</strong> ${item.intensity}/10</p>
    <p class="meta-line"><strong>Players:</strong> ${item.players} | <strong>Goalkeepers:</strong> ${item.gks}</p>
    <div class="tag-row">${item.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
    <div class="markdown">${simpleMarkdownToHtml(item.description)}</div>
  `;
  dom.modalContent.appendChild(details);
  if (!dom.modal.open) {
    dom.modal.showModal();
  }
}

function closeModalAndClearUrl() {
  state.currentExerciseSlug = "";
  if (dom.modal.open) {
    dom.modal.close();
  }
  clearExerciseUrl();
}

function syncExerciseFromUrl() {
  const slug = getExerciseSlugFromUrl();
  if (!slug) {
    state.currentExerciseSlug = "";
    if (dom.modal.open) {
      dom.modal.close();
    }
    return;
  }

  const exercise = state.exercises.find((item) => item.slug === slug);
  if (!exercise) {
    return;
  }

  if (state.currentExerciseSlug !== exercise.slug || !dom.modal.open) {
    openModal(exercise);
  }

  scrollCardIntoView(exercise.slug);
}

function getExerciseSlugFromUrl() {
  return window.location.hash.replace(/^#/, "");
}

function updateUrlForExercise(slug) {
  if (window.location.hash === `#${slug}`) {
    return;
  }
  history.pushState(null, "", `#${slug}`);
}

function clearExerciseUrl() {
  if (!window.location.hash) {
    return;
  }
  history.pushState(null, "", `${window.location.pathname}${window.location.search}`);
}

function scrollCardIntoView(slug) {
  const card = document.getElementById(slug);
  if (card) {
    card.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function renderMedia(item, className) {
  const wrapper = document.createElement("div");
  wrapper.className = className;
  const isCardMedia = className === "card-media";
  const shouldAutoLoop = isCardMedia && item.loopOnHome;

  if (!item.mediaUrl) {
    wrapper.innerHTML = `<img alt="placeholder field" src="${DEFAULT_VISUAL_PATH}" />`;
    return wrapper;
  }

  if (item.mediaType === "video" || looksLikeVideo(item.mediaUrl)) {
    if (isCardMedia) {
      wrapper.dataset.lazyVideo = "true";
      wrapper.dataset.videoSrc = item.mediaUrl;
      wrapper.dataset.videoLoop = shouldAutoLoop ? "true" : "false";
      wrapper.innerHTML = `<div class="card-video-placeholder" aria-hidden="true"></div>`;
    } else {
      wrapper.innerHTML = `<video controls preload="metadata" src="${escapeAttr(item.mediaUrl)}"></video>`;
    }
  } else {
    wrapper.innerHTML = `<img alt="${escapeAttr(item.title)}" src="${escapeAttr(item.mediaUrl)}" />`;
  }
  return wrapper;
}

function setupVisibleCardMedia() {
  if (state.cardMediaObserver) {
    state.cardMediaObserver.disconnect();
    state.cardMediaObserver = null;
  }

  const lazyWrappers = Array.from(dom.exerciseGrid.querySelectorAll(".card-media[data-lazy-video='true']"));
  if (!lazyWrappers.length) {
    return;
  }

  const root = getCardMediaObserverRoot();

  state.cardMediaObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const wrapper = entry.target;
        const card = wrapper.closest(".card");
        const nearViewport = isElementNearViewport(wrapper, root, 260);
        const fullyVisible = card ? isCardFullyVisible(card, root) : false;

        if (nearViewport || entry.isIntersecting) {
          mountCardVideo(wrapper);
          if (fullyVisible) {
            scheduleCardVideoAutoplay(wrapper);
          } else {
            clearCardVideoTimer(wrapper);
            const video = wrapper.querySelector("video");
            if (video) {
              video.pause();
            }
          }
        } else {
          unmountCardVideo(wrapper);
        }
      });
      pauseNonFullyVisibleCardVideos();
    },
    {
      root,
      rootMargin: "260px 0px 260px 0px",
      threshold: [0, 0.01, 0.2, 0.6, 1],
    }
  );

  lazyWrappers.forEach((wrapper) => {
    unmountCardVideo(wrapper);
    state.cardMediaObserver.observe(wrapper);
    if (isElementNearViewport(wrapper, root, 260)) {
      mountCardVideo(wrapper);
    }
    const card = wrapper.closest(".card");
    if (card && isCardFullyVisible(card, root)) {
      scheduleCardVideoAutoplay(wrapper);
    }
  });

  scheduleActiveCardMediaSync();
}

function mountCardVideo(wrapper) {
  if (wrapper.querySelector("video")) {
    return;
  }

  const videoSrc = wrapper.dataset.videoSrc;
  if (!videoSrc) {
    return;
  }

  const video = document.createElement("video");
  video.src = videoSrc;
  video.preload = "metadata";
  video.muted = true;
  video.loop = true;
  video.playsInline = true;

  wrapper.replaceChildren(video);
}

function unmountCardVideo(wrapper) {
  clearCardVideoTimer(wrapper);
  const video = wrapper.querySelector("video");
  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }

  wrapper.innerHTML = `<div class="card-video-placeholder" aria-hidden="true"></div>`;
}

function clearCardVideoTimer(wrapper) {
  if (wrapper._autoplayTimer) {
    window.clearTimeout(wrapper._autoplayTimer);
    wrapper._autoplayTimer = null;
  }
}

function scheduleCardVideoAutoplay(wrapper) {
  if (wrapper._autoplayTimer || !wrapper.querySelector("video")) {
    return;
  }

  wrapper._autoplayTimer = window.setTimeout(() => {
    const video = wrapper.querySelector("video");
    if (!video) {
      wrapper._autoplayTimer = null;
      return;
    }
    pauseNonMatchingCardVideos(wrapper);
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
    wrapper._autoplayTimer = null;
  }, 1);
}

function scheduleActiveCardMediaSync() {
  if (state.activeCardMediaSyncTimer) {
    window.clearTimeout(state.activeCardMediaSyncTimer);
  }

  state.activeCardMediaSyncTimer = window.setTimeout(() => {
    state.activeCardMediaSyncTimer = null;
    syncActiveCardMediaPlayback();
  }, 120);
}

function syncActiveCardMediaPlayback() {
  const root = getCardMediaObserverRoot();
  let activeWrapper = null;

  dom.exerciseGrid.querySelectorAll(".card-media[data-lazy-video='true']").forEach((wrapper) => {
    const card = wrapper.closest(".card");
    if (!card) {
      return;
    }

    if (isElementNearViewport(wrapper, root, 260)) {
      mountCardVideo(wrapper);
    }

    if (!activeWrapper && isCardFullyVisible(card, root)) {
      activeWrapper = wrapper;
    }
  });

  if (activeWrapper) {
    pauseNonMatchingCardVideos(activeWrapper);
    scheduleCardVideoAutoplay(activeWrapper);
  } else {
    pauseNonFullyVisibleCardVideos();
  }
}

function pauseNonFullyVisibleCardVideos() {
  const root = getCardMediaObserverRoot();
  dom.exerciseGrid.querySelectorAll(".card-media[data-lazy-video='true']").forEach((wrapper) => {
    const card = wrapper.closest(".card");
    if (card && isCardFullyVisible(card, root)) {
      return;
    }
    clearCardVideoTimer(wrapper);
    const video = wrapper.querySelector("video");
    if (video) {
      video.pause();
    }
  });
}

function pauseNonMatchingCardVideos(activeWrapper) {
  dom.exerciseGrid.querySelectorAll(".card-media[data-lazy-video='true']").forEach((wrapper) => {
    if (wrapper === activeWrapper) {
      return;
    }
    clearCardVideoTimer(wrapper);
    const video = wrapper.querySelector("video");
    if (video) {
      video.pause();
    }
  });
}

function isCardFullyVisible(element, root) {
  const rect = element.getBoundingClientRect();
  if (root instanceof Element) {
    const rootRect = root.getBoundingClientRect();
    return rect.top >= rootRect.top && rect.bottom <= rootRect.bottom;
  }
  return rect.top >= 0 && rect.bottom <= window.innerHeight;
}

function getCardMediaObserverRoot() {
  return window.matchMedia("(max-width: 940px)").matches ? dom.exerciseGrid : null;
}

function isElementNearViewport(element, root, margin = 200) {
  const rect = element.getBoundingClientRect();
  if (root instanceof Element) {
    const rootRect = root.getBoundingClientRect();
    return rect.bottom >= rootRect.top - margin && rect.top <= rootRect.bottom + margin;
  }
  return rect.bottom >= -margin && rect.top <= window.innerHeight + margin;
}

function matchesFilters(item) {
  if (state.searchTerm) {
    const haystack = `${item.title} ${item.description} ${item.tags.join(" ")} ${item.ageGroups.join(" ")}`.toLowerCase();
    if (!haystack.includes(state.searchTerm)) {
      return false;
    }
  }

  if (state.selectedAgeGroups.size > 0) {
    const hasAge = item.ageGroups.some((age) => state.selectedAgeGroups.has(age));
    if (!hasAge) {
      return false;
    }
  }

  if (state.complexityMin !== null && item.complexity < state.complexityMin) {
    return false;
  }
  if (state.complexityMax !== null && item.complexity > state.complexityMax) {
    return false;
  }

  if (state.intensityMin !== null && item.intensity < state.intensityMin) {
    return false;
  }
  if (state.intensityMax !== null && item.intensity > state.intensityMax) {
    return false;
  }

  if (state.dateMin && item.date < state.dateMin) {
    return false;
  }
  if (state.dateMax && item.date > state.dateMax) {
    return false;
  }

  if (state.selectedTags.size > 0) {
    const matchesTags =
      state.tagMatchMode === "all"
        ? Array.from(state.selectedTags).every((tag) => item.tags.includes(tag))
        : item.tags.some((tag) => state.selectedTags.has(tag));
    if (!matchesTags) {
      return false;
    }
  }

  if (state.playersMin !== null && item.players < state.playersMin) {
    return false;
  }
  if (state.playersMax !== null && item.players > state.playersMax) {
    return false;
  }
  if (state.gksMin !== null && item.gks < state.gksMin) {
    return false;
  }
  if (state.gksMax !== null && item.gks > state.gksMax) {
    return false;
  }
  return true;
}

function resetFilters() {
  state.selectedAgeGroups.clear();
  state.selectedTags.clear();
  state.tagMatchMode = "any";
  state.searchTerm = "";
  state.complexityMin = null;
  state.complexityMax = null;
  state.intensityMin = null;
  state.intensityMax = null;
  state.dateMin = "";
  state.dateMax = "";
  state.playersMin = null;
  state.playersMax = null;
  state.gksMin = null;
  state.gksMax = null;

  dom.searchInput.value = "";
  renderTagMatchToggle();
  dom.complexityMin.value = "";
  dom.complexityMax.value = "";
  dom.intensityMin.value = "";
  dom.intensityMax.value = "";
  dom.dateMin.value = "";
  dom.dateMax.value = "";
  dom.playersMin.value = "";
  dom.playersMax.value = "";
  dom.gksMin.value = "";
  dom.gksMax.value = "";

  renderFilterChips();
  render();
}

function parseExerciseMarkdown(raw, sourceName) {
  const { meta, body } = splitFrontmatter(raw);
  if (!meta.title) {
    return null;
  }

  const ageGroups = toList(meta.age_group || meta.age_groups || meta.age || "Any");
  const tags = toList(meta.tags || "");
  const complexity = clampComplexity(meta.complexity) ?? 5;
  const intensity = clampComplexity(meta.intensity) ?? 5;
  const players = Number.parseInt(meta.players, 10);
  const gks = Number.parseInt(meta.gks || meta.goalkeepers || 0, 10);
  const parsedDate = parseExerciseDateFromSourceName(sourceName);

  return {
    id: slugify(`${sourceName}-${meta.title}`),
    slug: encodeURIComponent(String(meta.title).trim()),
    title: String(meta.title).trim(),
    ageGroups: ageGroups.length ? ageGroups : ["Any"],
    complexity,
    intensity,
    tags: tags.length ? tags : ["general"],
    date: parsedDate.iso,
    displayDate: parsedDate.display,
    players: Number.isFinite(players) ? players : 0,
    gks: Number.isFinite(gks) ? gks : 0,
    mediaType: String(meta.media_type || "").toLowerCase(),
    mediaUrl: normalizeMediaUrl(meta.media_url || meta.image || meta.video || ""),
    loopOnHome: toBoolean(meta.loop_on_home || meta.autoplay_loop),
    description: body.trim(),
  };
}

function ensureUniqueExerciseSlugs(exercises) {
  const seenCounts = new Map();

  return exercises.map((exercise) => {
    const baseSlug = exercise.slug || encodeURIComponent(exercise.title.trim());
    const count = (seenCounts.get(baseSlug) || 0) + 1;
    seenCounts.set(baseSlug, count);

    return {
      ...exercise,
      slug: count === 1 ? baseSlug : `${baseSlug}-${count}`,
    };
  });
}

function splitFrontmatter(markdown) {
  const normalized = markdown.replace(/\r\n/g, "\n").replace(/`r`n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { meta: {}, body: normalized };
  }
  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    return { meta: {}, body: normalized };
  }
  const frontmatter = normalized.slice(4, endIndex);
  const body = normalized.slice(endIndex + 5);
  return {
    meta: parseFrontmatter(frontmatter),
    body,
  };
}

function parseFrontmatter(text) {
  const meta = {};
  text.split("\n").forEach((line) => {
    const idx = line.indexOf(":");
    if (idx === -1) {
      return;
    }
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    meta[key] = value;
  });
  return meta;
}

function simpleMarkdownToHtml(markdown) {
  const escaped = escapeHtml(markdown);
  const lines = escaped.split("\n");
  const rawLines = markdown.split("\n");
  const chunks = [];
  let inList = false;

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = rawLines[i] ?? "";
    const rawTrimmed = rawLine.trim();
    const line = lines[i].trim();
    if (!line) {
      if (inList) {
        chunks.push("</ul>");
        inList = false;
      }
      continue;
    }

    const combinedDetailsSummary = rawTrimmed.match(
      /^<details(?:\s+[^>]*)?>\s*<summary(?:\s+[^>]*)?>([\s\S]*)<\/summary>\s*$/i
    );
    if (combinedDetailsSummary) {
      if (inList) {
        chunks.push("</ul>");
        inList = false;
      }
      const isOpen = /\bopen\b/i.test(rawTrimmed);
      chunks.push(`<details class="md-details"${isOpen ? " open" : ""}>`);
      chunks.push(`<summary>${renderInlineMarkdown(escapeHtml(combinedDetailsSummary[1]))}</summary>`);
      continue;
    }

    if (line.startsWith("- ")) {
      if (!inList) {
        chunks.push("<ul>");
        inList = true;
      }
      chunks.push(`<li>${renderInlineMarkdown(line.slice(2))}</li>`);
      continue;
    }

    if (/^<details(?:\s+[^>]*)?>$/i.test(rawTrimmed)) {
      if (inList) {
        chunks.push("</ul>");
        inList = false;
      }
      const isOpen = /\bopen\b/i.test(rawTrimmed);
      chunks.push(`<details class="md-details"${isOpen ? " open" : ""}>`);
      continue;
    }

    if (/^<\/details>$/i.test(rawTrimmed)) {
      if (inList) {
        chunks.push("</ul>");
        inList = false;
      }
      chunks.push("</details>");
      continue;
    }

    const summaryMatch = rawTrimmed.match(/^<summary(?:\s+[^>]*)?>([\s\S]*)<\/summary>$/i);
    if (summaryMatch) {
      if (inList) {
        chunks.push("</ul>");
        inList = false;
      }
      chunks.push(`<summary>${renderInlineMarkdown(escapeHtml(summaryMatch[1]))}</summary>`);
      continue;
    }

    if (inList) {
      chunks.push("</ul>");
      inList = false;
    }

    if (line.startsWith("## ")) {
      chunks.push(`<h3>${renderInlineMarkdown(line.slice(3))}</h3>`);
    } else if (line.startsWith("# ")) {
      chunks.push(`<h2>${renderInlineMarkdown(line.slice(2))}</h2>`);
    } else {
      chunks.push(`<p>${renderInlineMarkdown(line)}</p>`);
    }
  }

  if (inList) {
    chunks.push("</ul>");
  }

  return chunks.join("");
}

function renderInlineMarkdown(text) {
  return text
    .replace(/\[\[([^\]]+\.(?:png|jpe?g|gif|webp|svg|avif|mp4|webm|ogg))\]\]/gi, (_, fileName) => {
      return mediaTagFromPath(fileName, "");
    })
    .replace(/\[([^\]\r\n]+\.(?:png|jpe?g|gif|webp|svg|avif|mp4|webm|ogg))\](?!\()/gi, (_, fileName) => {
      return mediaTagFromPath(fileName, "");
    })
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
      return mediaTagFromPath(url, alt);
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" target="_blank" rel="noreferrer">$1</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function mediaTagFromPath(rawPath, altText) {
  const mediaUrl = normalizeMediaUrl(rawPath);
  if (!mediaUrl) {
    return "";
  }
  if (looksLikeVideo(mediaUrl)) {
    return `<video controls preload="metadata" src="${escapeAttr(mediaUrl)}"></video>`;
  }
  return `<img src="${escapeAttr(mediaUrl)}" alt="${escapeAttr(altText || "exercise visual")}" />`;
}

function dedupeById(items) {
  const map = new Map();
  items.forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
}

function uniqueValues(items) {
  return Array.from(new Set(items.map((value) => String(value).trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function looksLikeVideo(url) {
  return /\.(mp4|webm|ogg)(\?.*)?$/i.test(url);
}

function toList(value) {
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function toNumOrNull(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function clampComplexity(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) {
    return null;
  }
  return Math.max(1, Math.min(10, n));
}

function parseExerciseDateFromSourceName(sourceName) {
  const match = String(sourceName).match(/_(\d{2})(\d{2})(\d{2})(?=\.md$)/i);
  if (!match) {
    return {
      iso: DEFAULT_EXERCISE_DATE_ISO,
      display: formatIsoDateToDisplay(DEFAULT_EXERCISE_DATE_ISO),
    };
  }

  const [, day, month, year] = match;
  return {
    iso: `20${year}-${month}-${day}`,
    display: `${day}.${month}.${year}`,
  };
}

function formatIsoDateToDisplay(isoDate) {
  const match = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return "01.07.25";
  }
  const [, year, month, day] = match;
  return `${day}.${month}.${year.slice(-2)}`;
}

function normalizeDateInput(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : "";
}

function toBoolean(value) {
  return ["true", "yes", "1", "on"].includes(String(value || "").trim().toLowerCase());
}

function normalizeMediaUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (/^https?:\/\//i.test(raw)) {
    return "";
  }
  if (raw.startsWith("./data/visual/")) {
    return raw;
  }
  if (raw.startsWith("data/visual/")) {
    return `./${raw}`;
  }
  if (!raw.includes("/")) {
    return `${VISUAL_DIR_PATH}${raw}`;
  }
  return raw;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
