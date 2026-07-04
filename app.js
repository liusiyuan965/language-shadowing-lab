const storeKey = "language-growth-log-v2";
const legacyStoreKey = "shadowing-lab-v1";

const $ = (selector) => document.querySelector(selector);

const fields = {
  date: $("#dateInput"),
  duration: $("#durationInput"),
  topic: $("#topicInput"),
  source: $("#sourceInput"),
  ko: {
    url: $("#koUrl"),
    completed: $("#koCompleted"),
    score: $("#koScore"),
    recall: $("#koRecall"),
    repeats: $("#koRepeats"),
    note: $("#koNote"),
  },
  en: {
    url: $("#enUrl"),
    completed: $("#enCompleted"),
    score: $("#enScore"),
    recall: $("#enRecall"),
    repeats: $("#enRepeats"),
    note: $("#enNote"),
  },
};

const state = loadState();

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function emptyLanguage() {
  return {
    url: "",
    completed: false,
    score: null,
    recall: null,
    repeats: 0,
    note: "",
  };
}

function emptyRecord() {
  return {
    id: makeId(),
    date: localDate(),
    topic: "",
    source: "",
    duration: 1,
    createdAt: Date.now(),
    ko: emptyLanguage(),
    en: emptyLanguage(),
  };
}

function loadState() {
  const saved = localStorage.getItem(storeKey);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return {
        currentId: parsed.currentId || null,
        records: Array.isArray(parsed.records) ? parsed.records.map(normalizeRecord) : [],
      };
    } catch {
      localStorage.removeItem(storeKey);
    }
  }

  const migrated = migrateLegacyData();
  localStorage.setItem(storeKey, JSON.stringify(migrated));
  return migrated;
}

function normalizeRecord(record) {
  return {
    ...emptyRecord(),
    ...record,
    duration: positiveNumber(record.duration, 1),
    ko: { ...emptyLanguage(), ...(record.ko || {}) },
    en: { ...emptyLanguage(), ...(record.en || {}) },
  };
}

function migrateLegacyData() {
  const fallback = { currentId: null, records: [] };
  const saved = localStorage.getItem(legacyStoreKey);
  if (!saved) return fallback;

  try {
    const legacy = JSON.parse(saved);
    const sessions = Array.isArray(legacy.sessions) ? legacy.sessions : [];
    const records = sessions.map((session, index) => {
      const ko = session.languages?.ko || {};
      const en = session.languages?.en || {};
      const duration = Math.max(Number(ko.seconds) || 0, Number(en.seconds) || 0) / 60;
      return {
        id: session.id || makeId(),
        date: session.date || localDate(),
        topic: session.topic || "",
        source: session.source || "",
        duration: duration > 0 ? Number(duration.toFixed(1)) : 1,
        createdAt: Date.now() - (sessions.length - index) * 1000,
        ko: legacyLanguage(ko, session.completed),
        en: legacyLanguage(en, session.completed),
      };
    });
    return {
      currentId: records.some((item) => item.id === legacy.currentId) ? legacy.currentId : null,
      records,
    };
  } catch {
    return fallback;
  }
}

function legacyLanguage(language, completed) {
  return {
    url: language.videoUrl || "",
    completed: Boolean(completed),
    score: legacyAverage(language.scores),
    recall: nullableNumber(language.scores?.recall),
    repeats: 0,
    note: "",
  };
}

function legacyAverage(scores) {
  if (!scores) return null;
  const values = [scores.accuracy, scores.fluency, scores.pronunciation, scores.intonation]
    .map(nullableNumber)
    .filter((item) => item !== null);
  if (!values.length) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
}

function nullableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function saveState() {
  localStorage.setItem(storeKey, JSON.stringify(state));
}

function currentRecord() {
  return state.records.find((record) => record.id === state.currentId) || null;
}

function readLanguage(languageFields) {
  return {
    url: languageFields.url.value.trim(),
    completed: languageFields.completed.checked,
    score: nullableNumber(languageFields.score.value),
    recall: nullableNumber(languageFields.recall.value),
    repeats: Math.max(0, Number(languageFields.repeats.value) || 0),
    note: languageFields.note.value.trim(),
  };
}

function readForm() {
  const existing = currentRecord();
  return {
    id: existing?.id || makeId(),
    date: fields.date.value || localDate(),
    topic: fields.topic.value.trim(),
    source: fields.source.value.trim(),
    duration: positiveNumber(fields.duration.value, 1),
    createdAt: existing?.createdAt || Date.now(),
    ko: readLanguage(fields.ko),
    en: readLanguage(fields.en),
  };
}

function writeLanguage(languageFields, language) {
  languageFields.url.value = language.url || "";
  languageFields.completed.checked = Boolean(language.completed);
  languageFields.score.value = language.score ?? "";
  languageFields.recall.value = language.recall ?? "";
  languageFields.repeats.value = language.repeats ?? 0;
  languageFields.note.value = language.note || "";
}

function writeForm(record = emptyRecord()) {
  fields.date.value = record.date;
  fields.duration.value = record.duration;
  fields.topic.value = record.topic;
  fields.source.value = record.source;
  writeLanguage(fields.ko, record.ko);
  writeLanguage(fields.en, record.en);

  const isEditing = Boolean(state.currentId);
  $("#formTitle").textContent = isEditing ? "编辑记录" : "记录今天";
  $("#recordState").textContent = isEditing ? record.date : "新记录";
  $("#deleteBtn").hidden = !isEditing;
  $("#saveFeedback").textContent = "";
}

function saveRecord() {
  const record = readForm();
  const index = state.records.findIndex((item) => item.id === record.id);
  if (index >= 0) {
    state.records[index] = record;
  } else {
    state.records.push(record);
  }
  state.currentId = record.id;
  saveState();
  renderAll();
  writeForm(record);
  $("#saveFeedback").textContent = "已保存，成长曲线已更新。";
}

function newRecord() {
  state.currentId = null;
  saveState();
  writeForm(emptyRecord());
  renderHistory();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteRecord() {
  const record = currentRecord();
  if (!record) return;
  if (!window.confirm(`删除“${record.topic || record.date}”这条记录？`)) return;
  state.records = state.records.filter((item) => item.id !== record.id);
  state.currentId = null;
  saveState();
  writeForm(emptyRecord());
  renderAll();
}

function isComplete(record) {
  return Boolean(record.ko.completed && record.en.completed);
}

function completedLanguageCount(record) {
  return Number(Boolean(record.ko.completed)) + Number(Boolean(record.en.completed));
}

function startOfWeek() {
  const date = new Date();
  const day = date.getDay() || 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day + 1);
  return date;
}

function recordsThisWeek() {
  const weekStart = startOfWeek();
  return state.records.filter((record) => isComplete(record) && new Date(`${record.date}T00:00:00`) >= weekStart);
}

function calculateStreak() {
  const completedDates = new Set(state.records.filter(isComplete).map((record) => record.date));
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  let streak = 0;

  if (!completedDates.has(localDate(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (completedDates.has(localDate(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function renderMetrics() {
  const weekCount = new Set(recordsThisWeek().map((record) => record.date)).size;
  const videoCount = state.records.reduce((sum, record) => sum + completedLanguageCount(record), 0);
  const totalMinutes = state.records.reduce(
    (sum, record) => sum + positiveNumber(record.duration, 0) * completedLanguageCount(record),
    0,
  );
  const recalls = state.records.flatMap((record) =>
    ["ko", "en"]
      .filter((language) => record[language].completed)
      .map((language) => nullableNumber(record[language].recall))
      .filter((value) => value !== null),
  );
  const recallAverage = recalls.length
    ? `${Math.round(recalls.reduce((sum, value) => sum + value, 0) / recalls.length)}%`
    : "-";

  $("#streakDays").textContent = calculateStreak();
  $("#weekCount").textContent = weekCount;
  $("#videoCount").textContent = videoCount;
  $("#totalMinutes").textContent = Number(totalMinutes.toFixed(1));
  $("#recallAverage").textContent = recallAverage;
  $("#weekProgressText").textContent = `${weekCount} / 7 天`;
  $("#weekProgressBar").style.width = `${Math.min(100, (weekCount / 7) * 100)}%`;
}

function renderTrend() {
  const svg = $("#trendChart");
  const records = state.records
    .filter((record) => record.ko.score !== null || record.en.score !== null)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    .slice(-10);

  if (!records.length) {
    svg.innerHTML = `<text class="chart-empty" x="360" y="130" text-anchor="middle">保存评分后，这里会出现双语成长曲线</text>`;
    return;
  }

  const width = 720;
  const height = 260;
  const left = 42;
  const right = 18;
  const top = 18;
  const bottom = 38;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const xFor = (index) => left + (records.length === 1 ? chartWidth / 2 : (index / (records.length - 1)) * chartWidth);
  const yFor = (score) => top + ((5 - score) / 4) * chartHeight;

  const grid = [1, 2, 3, 4, 5]
    .map((value) => {
      const y = yFor(value);
      return `<line class="chart-grid" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"></line>
        <text class="chart-label" x="${left - 12}" y="${y + 4}" text-anchor="middle">${value}</text>`;
    })
    .join("");

  const labels = records
    .map((record, index) => {
      const label = record.date.slice(5).replace("-", "/");
      return `<text class="chart-label" x="${xFor(index)}" y="${height - 12}" text-anchor="middle">${label}</text>`;
    })
    .join("");

  const series = ["ko", "en"]
    .map((language) => {
      const points = records
        .map((record, index) => ({ x: xFor(index), y: record[language].score }))
        .filter((point) => point.y !== null);
      if (!points.length) return "";
      const linePoints = points.map((point) => `${point.x},${yFor(point.y)}`).join(" ");
      const circles = points
        .map(
          (point) =>
            `<circle class="chart-point-${language}" cx="${point.x}" cy="${yFor(point.y)}" r="4"></circle>`,
        )
        .join("");
      return `<polyline class="chart-line-${language}" points="${linePoints}"></polyline>${circles}`;
    })
    .join("");

  svg.innerHTML = `${grid}${labels}${series}`;
}

function renderHeatmap() {
  const container = $("#heatmap");
  const days = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() - 27);

  for (let index = 0; index < 28; index += 1) {
    const date = localDate(cursor);
    const level = Math.min(
      2,
      state.records
        .filter((record) => record.date === date)
        .reduce((sum, record) => sum + completedLanguageCount(record), 0),
    );
    days.push(
      `<div class="heat-day level-${level}" title="${date}：完成 ${level} 种语言"><span>${cursor.getDate()}</span></div>`,
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  container.innerHTML = days.join("");
}

function renderHistory() {
  const container = $("#historyList");
  const records = state.records
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  $("#historyCount").textContent = `${records.length} 条`;

  if (!records.length) {
    container.innerHTML = `<div class="empty-state">第一条记录保存后，成长会从这里开始累积。</div>`;
    return;
  }

  container.innerHTML = records
    .map((record) => {
      const done = isComplete(record);
      return `
        <button class="history-item ${record.id === state.currentId ? "active" : ""}" data-record-id="${record.id}">
          <div class="history-main">
            <span class="history-date">${escapeHtml(record.date)} · ${record.duration} 分钟</span>
            <strong>${escapeHtml(record.topic || "未命名记录")}</strong>
            <span class="history-note">${escapeHtml(record.source || "暂无中文摘要")}</span>
          </div>
          <div class="history-scores">
            <span class="score-chip ko">韩 ${formatScore(record.ko.score)}</span>
            <span class="score-chip en">英 ${formatScore(record.en.score)}</span>
          </div>
          <span class="completion-mark ${done ? "done" : ""}" title="${done ? "双语完成" : "尚未全部完成"}">
            ${done ? "✓" : completedLanguageCount(record)}
          </span>
        </button>
      `;
    })
    .join("");
}

function formatScore(score) {
  return score === null || score === undefined ? "-" : Number(score).toFixed(1);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderAll() {
  renderMetrics();
  renderTrend();
  renderHeatmap();
  renderHistory();
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `language-growth-${localDate()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

$("#saveBtn").addEventListener("click", saveRecord);
$("#newRecordBtn").addEventListener("click", newRecord);
$("#deleteBtn").addEventListener("click", deleteRecord);
$("#exportBtn").addEventListener("click", downloadJson);

$("#historyList").addEventListener("click", (event) => {
  const item = event.target.closest("[data-record-id]");
  if (!item) return;
  state.currentId = item.dataset.recordId;
  saveState();
  writeForm(currentRecord());
  renderHistory();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js");
  });
}

writeForm(currentRecord() || emptyRecord());
renderAll();
