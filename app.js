const storeKey = "shadowing-lab-v1";
const todayIso = new Date().toISOString().slice(0, 10);

const defaultScores = {
  accuracy: 3,
  fluency: 3,
  pronunciation: 3,
  intonation: 3,
  recall: 60,
};

const state = loadState();
let activeLang = "ko";
let activeMode = "listen";
let timer = null;
let seconds = 0;
let objectUrl = "";
let revealScript = false;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const fields = {
  topic: $("#topicInput"),
  source: $("#sourceInput"),
  videoUrl: $("#videoUrlInput"),
  videoFile: $("#videoFileInput"),
  script: $("#scriptInput"),
};

function loadState() {
  const saved = localStorage.getItem(storeKey);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      localStorage.removeItem(storeKey);
    }
  }
  return {
    currentId: crypto.randomUUID(),
    sessions: [
      {
        id: crypto.randomUUID(),
        date: todayIso,
        topic: "",
        source: "",
        completed: false,
        languages: {
          ko: makeLanguage(),
          en: makeLanguage(),
        },
        expressions: [],
      },
    ],
  };
}

function makeLanguage() {
  return {
    videoUrl: "",
    fileName: "",
    script: "",
    sentences: [],
    doneSentences: [],
    scores: { ...defaultScores },
    seconds: 0,
  };
}

function saveState() {
  localStorage.setItem(storeKey, JSON.stringify(state));
  renderAll();
}

function currentSession() {
  let session = state.sessions.find((item) => item.id === state.currentId);
  if (!session) {
    session = state.sessions[0];
    state.currentId = session.id;
  }
  return session;
}

function activeData() {
  const session = currentSession();
  if (!session.languages[activeLang]) session.languages[activeLang] = makeLanguage();
  return session.languages[activeLang];
}

function syncFieldsFromState() {
  const session = currentSession();
  const lang = activeData();
  fields.topic.value = session.topic || "";
  fields.source.value = session.source || "";
  fields.videoUrl.value = lang.videoUrl || "";
  fields.script.value = lang.script || "";
  $("#todayLabel").textContent = session.date;
  $("#activeLangTitle").textContent = activeLang === "ko" ? "韩语训练" : "英语训练";
  seconds = lang.seconds || 0;
  updateTimer();
  updateVideo();
  updateScores();
  renderSentences();
  applyMode();
}

function persistForm() {
  const session = currentSession();
  const lang = activeData();
  session.topic = fields.topic.value.trim();
  session.source = fields.source.value.trim();
  lang.videoUrl = fields.videoUrl.value.trim();
  lang.script = fields.script.value.trim();
  saveState();
}

function parseVideoSource(value) {
  const raw = String(value || "").trim();
  if (!raw) return { type: "empty", src: "" };

  const iframeMatch = raw.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  const candidate = iframeMatch ? iframeMatch[1] : raw;
  let url;
  try {
    url = new URL(candidate, window.location.href);
  } catch {
    return { type: "invalid", src: "" };
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let videoId = "";

  if (host === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] || "";
  } else if (host.endsWith("youtube.com")) {
    videoId =
      url.searchParams.get("v") ||
      url.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1] ||
      "";
  }
  if (videoId) {
    return { type: "embed", src: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}` };
  }

  if (host.endsWith("vimeo.com")) {
    const vimeoId = url.pathname.match(/(?:video\/)?(\d+)/)?.[1];
    if (vimeoId) return { type: "embed", src: `https://player.vimeo.com/video/${vimeoId}` };
  }

  if (/\.(mp4|webm|ogg|mov|m4v)(?:$|[?#])/i.test(url.href) || url.protocol === "blob:") {
    return { type: "video", src: url.href };
  }

  if (iframeMatch || host.endsWith("heygen.com")) {
    return { type: "embed", src: url.href };
  }

  return { type: "embed", src: url.href };
}

function setVideoFeedback(message, isError = false) {
  const feedback = $("#videoFeedback");
  feedback.textContent = message;
  feedback.classList.toggle("visible", Boolean(message));
  feedback.classList.toggle("error", isError);
}

function updateVideo(showFeedback = false) {
  const video = $("#videoPlayer");
  const embed = $("#embedPlayer");
  const empty = $("#emptyVideo");
  const lang = activeData();
  const source = objectUrl
    ? { type: "video", src: objectUrl }
    : parseVideoSource(lang.videoUrl);

  video.style.display = "none";
  embed.style.display = "none";
  embed.removeAttribute("src");

  if (source.type === "video") {
    if (video.src !== source.src) video.src = source.src;
    video.style.display = "block";
    video.playbackRate = modeSettings()[activeMode].rate;
    empty.style.display = "none";
    if (showFeedback) setVideoFeedback("视频已加载，可以开始训练。");
  } else if (source.type === "embed") {
    video.pause();
    video.removeAttribute("src");
    video.load();
    embed.src = source.src;
    embed.style.display = "block";
    empty.style.display = "none";
    if (showFeedback) {
      setVideoFeedback("嵌入视频已加载。若画面被平台阻止，请使用 HeyGen 的“嵌入链接”或选择本地视频文件。");
    }
  } else {
    video.pause();
    video.removeAttribute("src");
    video.load();
    empty.style.display = "grid";
    if (source.type === "invalid") {
      setVideoFeedback("链接格式无法识别，请检查后重试。", true);
    } else if (showFeedback) {
      setVideoFeedback("请先粘贴视频链接，或选择本地视频文件。", true);
    }
  }
}

function modeSettings() {
  return {
    listen: {
      title: "完整聆听",
      text: "正常速度播放，先熟悉内容与节奏。",
      rate: 1,
    },
    repeat: {
      title: "降速跟读",
      text: "视频自动调整为 0.75 倍速，逐句模仿。",
      rate: 0.75,
    },
    shadow: {
      title: "影子训练",
      text: "视频以 0.9 倍速连续播放，紧跟声音复述。",
      rate: 0.9,
    },
    recall: {
      title: "脱稿复述",
      text: "文稿已隐藏，播放后凭记忆完整表达。",
      rate: 1,
    },
  };
}

function applyMode() {
  const settings = modeSettings()[activeMode];
  const video = $("#videoPlayer");
  const scriptCard = $(".script-card");
  const visibilityButton = $("#scriptVisibilityBtn");

  video.playbackRate = settings.rate;
  $("#modeStatusTitle").textContent = settings.title;
  $("#modeStatusText").textContent = settings.text;
  $("#modeRate").textContent = `${settings.rate}×`;

  const isRecall = activeMode === "recall";
  if (!isRecall) revealScript = false;
  scriptCard.classList.toggle("masked", isRecall);
  scriptCard.classList.toggle("revealed", isRecall && revealScript);
  visibilityButton.hidden = !isRecall;
  visibilityButton.textContent = revealScript ? "重新隐藏文稿" : "临时查看文稿";
}

function updateScores() {
  const scores = activeData().scores;
  $$(".score-input").forEach((input) => {
    const key = input.dataset.score;
    input.value = scores[key];
    const suffix = key === "recall" ? "%" : "";
    $(`#${key}Value`).textContent = `${scores[key]}${suffix}`;
  });
}

function splitSentences(text) {
  return text
    .replace(/\n+/g, " ")
    .split(/(?<=[。！？!?\.])\s+|(?<=[。！？!?])/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function renderSentences() {
  const container = $("#sentenceList");
  const lang = activeData();
  const sentences = lang.sentences.length ? lang.sentences : splitSentences(lang.script);
  if (!sentences.length) {
    container.innerHTML = `<div class="sentence"><span></span><p>暂无句子</p></div>`;
    return;
  }
  container.innerHTML = sentences
    .map((sentence, index) => {
      const done = lang.doneSentences.includes(index);
      return `
        <div class="sentence ${done ? "done" : ""}">
          <button data-sentence="${index}" aria-label="标记句子">${done ? "✓" : index + 1}</button>
          <p>${escapeHtml(sentence)}</p>
        </div>
      `;
    })
    .join("");
}

function renderExpressions() {
  const list = $("#expressionList");
  const expressions = state.sessions.flatMap((session) =>
    (session.expressions || []).map((expression) => ({
      ...expression,
      topic: session.topic,
      date: session.date,
    })),
  );
  $("#expressionCount").textContent = expressions.length;
  if (!expressions.length) {
    list.innerHTML = `<div class="expression-card"><p>今天先沉淀 3 个最想复用的表达。</p></div>`;
    return;
  }
  list.innerHTML = expressions
    .slice()
    .reverse()
    .map(
      (item) => `
        <article class="expression-card">
          <strong>${escapeHtml(item.text)}</strong>
          <p>${escapeHtml(item.meaning || "")}</p>
          <div class="pill-row">
            <span class="pill">${item.lang === "ko" ? "韩语" : "英语"}</span>
            <span class="pill">${escapeHtml(item.date)}</span>
          </div>
          ${item.variant ? `<p>${escapeHtml(item.variant)}</p>` : ""}
        </article>
      `,
    )
    .join("");
}

function renderHistory() {
  const list = $("#historyList");
  const sessions = state.sessions.slice().reverse().slice(0, 6);
  if (!sessions.length) {
    list.innerHTML = "";
    return;
  }
  list.innerHTML = sessions
    .map((session) => {
      const score = sessionAverage(session);
      return `
        <button class="history-item ${session.id === state.currentId ? "active" : ""}" data-session-id="${session.id}">
          <div>
            <strong>${escapeHtml(session.topic || "未命名训练")}</strong>
            <div class="history-meta">
              <p>${session.date}</p>
              <span class="history-state">${session.completed ? "已完成" : "草稿"}</span>
            </div>
          </div>
          <span class="history-score">${score || "-"}</span>
        </button>
      `;
    })
    .join("");
}

function renderMetrics() {
  const completed = state.sessions.filter((item) => item.completed);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  const weekCount = completed.filter((item) => new Date(item.date) >= weekStart).length;
  $("#weekRate").textContent = `${Math.round((weekCount / 7) * 100)}%`;
  $("#streakDays").textContent = String(calculateStreak(completed));
  $("#koAvg").textContent = languageAverage("ko") || "-";
  $("#enAvg").textContent = languageAverage("en") || "-";
}

function calculateStreak(sessions) {
  const dates = new Set(sessions.map((item) => item.date));
  let cursor = new Date(todayIso);
  let streak = 0;
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function languageAverage(langKey) {
  const scores = state.sessions
    .filter((session) => session.completed)
    .map((session) => averageScore(session.languages?.[langKey]?.scores))
    .filter(Boolean);
  if (!scores.length) return "";
  return (scores.reduce((sum, item) => sum + item, 0) / scores.length).toFixed(1);
}

function sessionAverage(session) {
  const ko = averageScore(session.languages?.ko?.scores);
  const en = averageScore(session.languages?.en?.scores);
  const values = [ko, en].filter(Boolean);
  if (!values.length) return "";
  return (values.reduce((sum, item) => sum + item, 0) / values.length).toFixed(1);
}

function averageScore(scores) {
  if (!scores) return 0;
  const values = [scores.accuracy, scores.fluency, scores.pronunciation, scores.intonation].map(Number);
  if (values.some((item) => !item)) return 0;
  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

function updateTimer() {
  const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  $("#timerDisplay").textContent = `${mins}:${secs}`;
}

function renderAll() {
  renderExpressions();
  renderHistory();
  renderMetrics();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `shadowing-lab-${todayIso}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

fields.topic.addEventListener("input", persistForm);
fields.source.addEventListener("input", persistForm);
fields.videoUrl.addEventListener("input", () => {
  objectUrl = "";
  persistForm();
});
fields.script.addEventListener("input", persistForm);

$("#loadVideoBtn").addEventListener("click", () => {
  objectUrl = "";
  persistForm();
  updateVideo(true);
});

fields.videoUrl.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  $("#loadVideoBtn").click();
});

fields.videoFile.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  const lang = activeData();
  lang.fileName = file.name;
  lang.videoUrl = "";
  fields.videoUrl.value = "";
  saveState();
  setVideoFeedback(`已选择本地文件：${file.name}`);
  updateVideo();
});

$("#videoPlayer").addEventListener("error", () => {
  setVideoFeedback("视频文件无法播放。建议使用 MP4、WebM，或直接选择 HeyGen 下载的视频文件。", true);
});

$$(".switch-button").forEach((button) => {
  button.addEventListener("click", () => {
    persistForm();
    activeLang = button.dataset.lang;
    objectUrl = "";
    $$(".switch-button").forEach((item) => item.classList.toggle("active", item === button));
    syncFieldsFromState();
  });
});

$$(".mode-button").forEach((button) => {
  button.addEventListener("click", () => {
    activeMode = button.dataset.mode;
    $$(".mode-button").forEach((item) => item.classList.toggle("active", item === button));
    applyMode();
  });
});

$("#scriptVisibilityBtn").addEventListener("click", () => {
  revealScript = !revealScript;
  applyMode();
});

$$(".score-input").forEach((input) => {
  input.addEventListener("input", () => {
    const scores = activeData().scores;
    scores[input.dataset.score] = Number(input.value);
    updateScores();
    saveState();
  });
});

$("#splitBtn").addEventListener("click", () => {
  const lang = activeData();
  lang.sentences = splitSentences(lang.script);
  lang.doneSentences = [];
  saveState();
  renderSentences();
});

$("#clearDoneBtn").addEventListener("click", () => {
  activeData().doneSentences = [];
  saveState();
  renderSentences();
});

$("#sentenceList").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-sentence]");
  if (!button) return;
  const index = Number(button.dataset.sentence);
  const lang = activeData();
  if (lang.doneSentences.includes(index)) {
    lang.doneSentences = lang.doneSentences.filter((item) => item !== index);
  } else {
    lang.doneSentences.push(index);
  }
  saveState();
  renderSentences();
});

$("#historyList").addEventListener("click", (event) => {
  const historyItem = event.target.closest("[data-session-id]");
  if (!historyItem) return;

  persistForm();
  state.currentId = historyItem.dataset.sessionId;
  activeLang = "ko";
  activeMode = "listen";
  revealScript = false;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = "";
  $$(".switch-button").forEach((item) => item.classList.toggle("active", item.dataset.lang === "ko"));
  $$(".mode-button").forEach((item) => item.classList.toggle("active", item.dataset.mode === "listen"));
  syncFieldsFromState();
  saveState();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

$("#timerBtn").addEventListener("click", () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
    $("#timerBtn").textContent = "开始";
    activeData().seconds = seconds;
    saveState();
    return;
  }
  $("#timerBtn").textContent = "暂停";
  timer = setInterval(() => {
    seconds += 1;
    activeData().seconds = seconds;
    updateTimer();
  }, 1000);
});

$("#saveBtn").addEventListener("click", () => {
  const session = currentSession();
  session.completed = true;
  persistForm();
});

$("#newSessionBtn").addEventListener("click", () => {
  persistForm();
  const session = {
    id: crypto.randomUUID(),
    date: todayIso,
    topic: "",
    source: "",
    completed: false,
    languages: { ko: makeLanguage(), en: makeLanguage() },
    expressions: [],
  };
  state.sessions.push(session);
  state.currentId = session.id;
  activeLang = "ko";
  objectUrl = "";
  saveState();
  $$(".switch-button").forEach((item) => item.classList.toggle("active", item.dataset.lang === "ko"));
  syncFieldsFromState();
});

$("#saveExpressionBtn").addEventListener("click", () => {
  const text = $("#expressionText").value.trim();
  if (!text) return;
  currentSession().expressions.push({
    id: crypto.randomUUID(),
    lang: activeLang,
    text,
    meaning: $("#expressionMeaning").value.trim(),
    variant: $("#expressionVariant").value.trim(),
  });
  $("#expressionText").value = "";
  $("#expressionMeaning").value = "";
  $("#expressionVariant").value = "";
  saveState();
});

$("#exportBtn").addEventListener("click", downloadJson);

window.addEventListener("beforeunload", () => {
  if (timer) clearInterval(timer);
  activeData().seconds = seconds;
  localStorage.setItem(storeKey, JSON.stringify(state));
});

if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js");
  });
}

syncFieldsFromState();
renderAll();
