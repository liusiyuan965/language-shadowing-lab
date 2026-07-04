const storeKey = "language-growth-log-v2";
const legacyStoreKey = "shadowing-lab-v1";

const $ = (selector) => document.querySelector(selector);

const fields = {
  date: $("#dateInput"),
  category: $("#categoryInput"),
  duration: $("#durationInput"),
  practiceMinutes: $("#practiceMinutesInput"),
  topic: $("#topicInput"),
  source: $("#sourceInput"),
  goal: $("#goalInput"),
  ko: {
    url: $("#koUrl"),
    completed: $("#koCompleted"),
    score: $("#koScore"),
    recall: $("#koRecall"),
    repeats: $("#koRepeats"),
    expression: $("#koExpression"),
    note: $("#koNote"),
  },
  en: {
    url: $("#enUrl"),
    completed: $("#enCompleted"),
    score: $("#enScore"),
    recall: $("#enRecall"),
    repeats: $("#enRepeats"),
    expression: $("#enExpression"),
    note: $("#enNote"),
  },
};

const promptTemplates = [
  {
    category: "日常",
    prompt: "讲述今天最值得记住的一个瞬间",
    topic: "今天最值得记住的一个瞬间",
    source: "今天发生了什么：\n为什么它值得记住：\n它让我有什么感受或发现：",
    goal: "不看稿讲清楚经过和感受，并自然使用 3 个表达",
  },
  {
    category: "工作",
    prompt: "复盘今天完成的一件具体工作",
    topic: "今天完成的一件工作",
    source: "我完成了什么：\n过程中遇到了什么：\n下一次我会怎样做得更好：",
    goal: "用清晰的顺序讲完，并减少无意义停顿",
  },
  {
    category: "观点",
    prompt: "表达一个最近改变了的看法",
    topic: "我最近改变的一个看法",
    source: "我以前怎么想：\n是什么让我改变：\n我现在的结论是：",
    goal: "说出完整观点，并给出至少一个原因和例子",
  },
  {
    category: "故事",
    prompt: "讲一个最近让你印象深刻的小故事",
    topic: "最近让我印象深刻的一件小事",
    source: "故事发生在哪里：\n发生了什么转折：\n最后我学到了什么：",
    goal: "脱稿讲完整，重点模仿连接词和叙事节奏",
  },
  {
    category: "复盘",
    prompt: "总结这周语言学习最明显的变化",
    topic: "这周语言学习的一个变化",
    source: "这周我练了什么：\n最明显的进步是：\n目前最需要突破的是：",
    goal: "对比过去和现在，并明确说出下周行动",
  },
];

let promptIndex = new Date().getDate() % promptTemplates.length;
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
    expression: "",
    note: "",
  };
}

function emptyRecord() {
  return {
    id: makeId(),
    date: localDate(),
    category: "日常",
    topic: "",
    source: "",
    duration: 1,
    practiceMinutes: 0,
    goal: "",
    createdAt: Date.now(),
    ko: emptyLanguage(),
    en: emptyLanguage(),
  };
}

function starterRecord(index = promptIndex) {
  const template = promptTemplates[index];
  return {
    ...emptyRecord(),
    category: template.category,
    topic: template.topic,
    source: template.source,
    practiceMinutes: 20,
    goal: template.goal,
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
    practiceMinutes: Math.max(0, Number(record.practiceMinutes) || 0),
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
    expression: "",
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
    expression: languageFields.expression.value.trim(),
    note: languageFields.note.value.trim(),
  };
}

function readForm() {
  const existing = currentRecord();
  return {
    id: existing?.id || makeId(),
    date: fields.date.value || localDate(),
    category: fields.category.value || "日常",
    topic: fields.topic.value.trim(),
    source: fields.source.value.trim(),
    duration: positiveNumber(fields.duration.value, 1),
    practiceMinutes: Math.max(0, Number(fields.practiceMinutes.value) || 0),
    goal: fields.goal.value.trim(),
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
  languageFields.expression.value = language.expression || "";
  languageFields.note.value = language.note || "";
}

function writeForm(record = emptyRecord()) {
  fields.date.value = record.date;
  fields.category.value = record.category || "日常";
  fields.duration.value = record.duration;
  fields.practiceMinutes.value = record.practiceMinutes ?? 0;
  fields.topic.value = record.topic;
  fields.source.value = record.source;
  fields.goal.value = record.goal || "";
  writeLanguage(fields.ko, record.ko);
  writeLanguage(fields.en, record.en);

  const isEditing = Boolean(state.currentId);
  $("#formTitle").textContent = isEditing ? "编辑记录" : "记录今天";
  $("#recordState").textContent = isEditing ? record.date : "新记录";
  $("#deleteBtn").hidden = !isEditing;
  $("#saveFeedback").textContent = "";
  $("#dailyPrompt").textContent = promptTemplates[promptIndex].prompt;
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
  writeForm(starterRecord());
  renderHistory();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function nextPrompt() {
  promptIndex = (promptIndex + 1) % promptTemplates.length;
  state.currentId = null;
  saveState();
  writeForm(starterRecord());
  renderHistory();
}

function deleteRecord() {
  const record = currentRecord();
  if (!record) return;
  if (!window.confirm(`删除“${record.topic || record.date}”这条记录？`)) return;
  state.records = state.records.filter((item) => item.id !== record.id);
  state.currentId = null;
  saveState();
  writeForm(starterRecord());
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
    (sum, record) => sum + Math.max(0, Number(record.practiceMinutes) || 0),
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
      const totalRepeats = Number(record.ko.repeats || 0) + Number(record.en.repeats || 0);
      return `
        <button class="history-item ${record.id === state.currentId ? "active" : ""}" data-record-id="${record.id}">
          <div class="history-topline">
            <span>${escapeHtml(record.date)}</span>
            <span class="category-chip">${escapeHtml(record.category || "日常")}</span>
            <span class="completion-text ${done ? "done" : ""}">${done ? "双语完成" : `完成 ${completedLanguageCount(record)}/2`}</span>
          </div>
          <div class="history-main">
            <strong>${escapeHtml(record.topic || "未命名记录")}</strong>
            <span class="history-note">${escapeHtml(record.source || "暂无中文摘要")}</span>
          </div>
          <div class="history-data">
            <span><b>${record.duration}</b> 分钟视频</span>
            <span><b>${record.practiceMinutes || 0}</b> 分钟练习</span>
            <span><b>${totalRepeats}</b> 次重复</span>
          </div>
          <div class="history-languages">
            ${historyLanguage("ko", "韩语", record.ko)}
            ${historyLanguage("en", "英语", record.en)}
          </div>
        </button>
      `;
    })
    .join("");
}

function historyLanguage(code, label, language) {
  return `
    <span class="history-language ${code}">
      <b>${label} ${formatScore(language.score)}</b>
      <small>脱稿 ${formatPercent(language.recall)}</small>
      ${language.expression ? `<em>${escapeHtml(language.expression)}</em>` : ""}
    </span>
  `;
}

function renderSnapshot() {
  const container = $("#recordSnapshot");
  const record =
    currentRecord() ||
    state.records
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)[0];

  if (!record) {
    container.innerHTML = `
      <div class="snapshot-empty">
        <span>最近记录</span>
        <strong>保存第一条记录后，这里会生成简洁的数据摘要。</strong>
      </div>
    `;
    return;
  }

  const totalRepeats = Number(record.ko.repeats || 0) + Number(record.en.repeats || 0);
  container.innerHTML = `
    <div class="snapshot-heading">
      <div>
        <span>${record.id === state.currentId ? "当前记录" : "最近保存"}</span>
        <strong>${escapeHtml(record.topic || "未命名记录")}</strong>
      </div>
      <span class="category-chip">${escapeHtml(record.category || "日常")}</span>
    </div>
    <div class="snapshot-facts">
      <span><b>${record.practiceMinutes || 0}</b><small>练习分钟</small></span>
      <span><b>${totalRepeats}</b><small>重复次数</small></span>
      <span><b>${formatPercent(averageRecall(record))}</b><small>平均脱稿</small></span>
    </div>
    <div class="snapshot-languages">
      ${snapshotLanguage("ko", "韩语", record.ko)}
      ${snapshotLanguage("en", "英语", record.en)}
    </div>
    ${record.goal ? `<p class="snapshot-goal"><span>本次目标</span>${escapeHtml(record.goal)}</p>` : ""}
  `;
}

function snapshotLanguage(code, label, language) {
  return `
    <div class="snapshot-language ${code}">
      <span>${label}</span>
      <strong>${formatScore(language.score)}<small> / 5</small></strong>
      <b>脱稿 ${formatPercent(language.recall)}</b>
      <p>${escapeHtml(language.expression || language.note || "尚未记录重点表达")}</p>
    </div>
  `;
}

function averageRecall(record) {
  const values = [record.ko.recall, record.en.recall].map(nullableNumber).filter((value) => value !== null);
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function formatScore(score) {
  return score === null || score === undefined ? "-" : Number(score).toFixed(1);
}

function formatPercent(value) {
  return value === null || value === undefined ? "-" : `${Math.round(Number(value))}%`;
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
  renderSnapshot();
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
$("#nextPromptBtn").addEventListener("click", nextPrompt);
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
    navigator.serviceWorker.register("./service-worker-v6.js");
  });
}

writeForm(currentRecord() || starterRecord());
renderAll();
