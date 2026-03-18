const api = window.todoDoddle;

// ── Categories ─────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'finance',   label: 'Finance',   color: '#4ade80' },
  { id: 'sales',     label: 'Sales Ops', color: '#60a5fa' },
  { id: 'legal',     label: 'Legal',     color: '#f472b6' },
  { id: 'marketing', label: 'Marketing', color: '#fb923c' },
  { id: 'other',     label: 'Other',     color: '#a78bfa' },
];

function getCat(id) {
  return CATEGORIES.find(c => c.id === id) || CATEGORIES[4];
}

// ── State ──────────────────────────────────────────────────────────────────
let tasks = [];
let currentTab = 'today';
let selectedCategory = 'other';
let calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let archiveDates = new Set();
let archiveSummaries = new Map(); // date -> { total, completed }

// ── DOM refs ───────────────────────────────────────────────────────────────
const taskList     = document.getElementById('task-list');
const taskInput    = document.getElementById('task-input');
const btnAdd       = document.getElementById('btn-add');
const progressBar  = document.getElementById('progress-bar');
const progressLbl  = document.getElementById('progress-label');
const emptyState   = document.getElementById('empty-state');
const clockEl      = document.getElementById('clock');
const dateDayEl    = document.getElementById('date-day');
const dateMetaEl   = document.getElementById('date-weekday-month');
const btnMinimize  = document.getElementById('btn-minimize');
const btnClose     = document.getElementById('btn-close');
const categoryRow  = document.getElementById('category-row');

const calGrid        = document.getElementById('cal-grid');
const calMonthLabel  = document.getElementById('cal-month-label');
const calPrev        = document.getElementById('cal-prev');
const calNext        = document.getElementById('cal-next');
const historyTaskList   = document.getElementById('history-task-list');
const historyDateLabel  = document.getElementById('history-date-label');
const historyEmptyState = document.getElementById('history-empty-state');

const weekDaysStrip  = document.getElementById('week-days-strip');
const categoryBarsEl = document.getElementById('category-bars');
const statsRowEl     = document.getElementById('stats-row');
const weekHeaderEl   = document.getElementById('week-header');

const carryoverBanner = document.getElementById('carryover-banner');
const carryoverMsg    = document.getElementById('carryover-msg');
const carryoverYes    = document.getElementById('carryover-yes');
const carryoverNo     = document.getElementById('carryover-no');

// ── Window controls ────────────────────────────────────────────────────────
btnMinimize.addEventListener('click', () => api.minimize());
btnClose.addEventListener('click',    () => api.close());

// ── Tab navigation ─────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    if (tab === currentTab) return;
    currentTab = tab;

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(`view-${tab}`).classList.remove('hidden');

    if (tab === 'history') initHistoryView();
    if (tab === 'summary') initSummaryView();
  });
});

// ── Clock ──────────────────────────────────────────────────────────────────
function updateClock() {
  const now  = new Date();
  let h      = now.getHours();
  const m    = String(now.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  clockEl.textContent = `${String(h).padStart(2, '0')}:${m} ${ampm}`;
}
updateClock();
setInterval(updateClock, 1000);

// ── Date display ───────────────────────────────────────────────────────────
async function loadDate() {
  const d = await api.getDate();
  dateDayEl.textContent  = String(d.day).padStart(2, '0');
  dateMetaEl.textContent = `${d.weekday}  ${d.month}`;
}
loadDate();

// ── Category pills (add-task form) ─────────────────────────────────────────
function renderCategoryPills() {
  categoryRow.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const pill = document.createElement('button');
    pill.className = 'cat-pill' + (cat.id === selectedCategory ? ' selected' : '');
    pill.textContent = cat.label;
    pill.style.setProperty('--cat-color', cat.color);
    pill.addEventListener('click', () => {
      selectedCategory = cat.id;
      renderCategoryPills();
    });
    categoryRow.appendChild(pill);
  });
}
renderCategoryPills();

// ── TODAY: Progress ────────────────────────────────────────────────────────
function updateProgress() {
  const total = tasks.length;
  const done  = tasks.filter(t => t.done).length;
  const pct   = total === 0 ? 0 : Math.round((done / total) * 100);
  progressBar.style.width = `${pct}%`;
  progressLbl.textContent = `${done} / ${total} done`;
  emptyState.classList.toggle('visible', total === 0);
}

// ── TODAY: Drag-to-reorder ─────────────────────────────────────────────────
let dragSrcId = null;

function handleDragStart(e) {
  dragSrcId = this.dataset.id;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragSrcId);
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('#task-list .task-item').forEach(el => el.classList.remove('drag-over'));
  if (this.dataset.id !== dragSrcId) this.classList.add('drag-over');
}

function handleDrop(e) {
  e.stopPropagation();
  const targetId = this.dataset.id;
  if (targetId === dragSrcId) return;

  const srcIdx = tasks.findIndex(t => t.id === dragSrcId);
  const dstIdx = tasks.findIndex(t => t.id === targetId);
  if (srcIdx === -1 || dstIdx === -1) return;

  const [moved] = tasks.splice(srcIdx, 1);
  tasks.splice(dstIdx, 0, moved);

  api.reorderTasks(tasks.map(t => t.id));
  renderTaskList();
}

function handleDragEnd() {
  document.querySelectorAll('#task-list .task-item').forEach(el => {
    el.classList.remove('dragging', 'drag-over');
  });
  dragSrcId = null;
}

// ── TODAY: Inline edit ─────────────────────────────────────────────────────
function startEdit(task, txtEl) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = task.text;
  input.className = 'task-edit-input';
  txtEl.replaceWith(input);
  input.focus();
  input.select();

  async function save() {
    const newText = input.value.trim();
    if (newText && newText !== task.text) {
      tasks = await api.updateTask(task.id, newText);
      task.text = newText;
    }
    txtEl.textContent = task.text;
    input.replaceWith(txtEl);
  }

  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = task.text; input.blur(); }
  });
}

// ── TODAY: Render task element ─────────────────────────────────────────────
function createTaskEl(task, isNew = false) {
  const li = document.createElement('li');
  li.className = 'task-item' + (task.done ? ' done' : '') + (isNew ? ' new-task' : '');
  li.dataset.id = task.id;
  li.setAttribute('draggable', 'true');

  li.addEventListener('dragstart', handleDragStart);
  li.addEventListener('dragover',  handleDragOver);
  li.addEventListener('drop',      handleDrop);
  li.addEventListener('dragend',   handleDragEnd);

  const cat = getCat(task.category);

  const handle = document.createElement('span');
  handle.className = 'drag-handle';
  handle.textContent = '⠿';
  handle.setAttribute('aria-hidden', 'true');

  const chk = document.createElement('button');
  chk.className = 'task-checkbox' + (task.done ? ' checked' : '');
  chk.setAttribute('aria-label', task.done ? 'Mark undone' : 'Mark done');
  chk.addEventListener('click', () => handleToggle(task.id, li));

  const body = document.createElement('div');
  body.className = 'task-body';

  const txt = document.createElement('span');
  txt.className   = 'task-text';
  txt.textContent = task.text;
  txt.title       = 'Double-click to edit';
  txt.addEventListener('dblclick', () => startEdit(task, txt));

  const catTag = document.createElement('span');
  catTag.className = 'task-cat-tag';
  catTag.textContent = cat.label;
  catTag.style.setProperty('--cat-color', cat.color);

  body.appendChild(txt);
  body.appendChild(catTag);

  const del = document.createElement('button');
  del.className = 'btn-delete';
  del.textContent = '×';
  del.setAttribute('aria-label', 'Delete task');
  del.addEventListener('click', () => handleDelete(task.id, li));

  li.appendChild(handle);
  li.appendChild(chk);
  li.appendChild(body);
  li.appendChild(del);
  return li;
}

function renderTaskList() {
  taskList.innerHTML = '';
  tasks.forEach(t => taskList.appendChild(createTaskEl(t)));
  updateProgress();
}

// ── TODAY: Actions ─────────────────────────────────────────────────────────
async function handleAdd() {
  const text = taskInput.value.trim();
  if (!text) return;
  taskInput.value = '';
  const task = await api.addTask(text, selectedCategory);
  if (!task) return;
  tasks.push(task);
  const li = createTaskEl(task, true);
  taskList.appendChild(li);
  updateProgress();
  li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function handleToggle(id, li) {
  tasks = await api.toggleTask(id);
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  if (task.done) {
    li.classList.add('done', 'just-done');
    li.querySelector('.task-checkbox').classList.add('checked');
    setTimeout(() => li.classList.remove('just-done'), 400);
  } else {
    li.classList.remove('done', 'just-done');
    li.querySelector('.task-checkbox').classList.remove('checked');
  }
  updateProgress();
}

async function handleDelete(id, li) {
  li.classList.add('removing');
  await new Promise(r => setTimeout(r, 240));
  tasks = await api.deleteTask(id);
  li.remove();
  updateProgress();
}

btnAdd.addEventListener('click', handleAdd);
taskInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleAdd();
  if (e.key === 'Escape') taskInput.value = '';
});

// ── Carry-over yesterday's unfinished tasks ────────────────────────────────
async function checkCarryOver() {
  const unfinished = await api.getYesterdayUnfinished();
  if (!unfinished.length) return;

  carryoverMsg.textContent =
    `${unfinished.length} task${unfinished.length > 1 ? 's' : ''} unfinished yesterday`;
  carryoverBanner.classList.remove('hidden');

  carryoverYes.onclick = async () => {
    for (const t of unfinished) {
      const task = await api.addTask(t.text, t.category);
      if (!task) continue;
      tasks.push(task);
      const li = createTaskEl(task, true);
      taskList.appendChild(li);
    }
    updateProgress();
    carryoverBanner.classList.add('hidden');
  };

  carryoverNo.onclick = () => carryoverBanner.classList.add('hidden');
}

// ── HISTORY VIEW ───────────────────────────────────────────────────────────
async function initHistoryView() {
  const summaries = await api.listArchiveSummaries();
  archiveSummaries = new Map(summaries.map(s => [s.date, s]));
  archiveDates = new Set(summaries.map(s => s.date));
  renderCalendar();
}

function renderCalendar() {
  const year  = calMonth.getFullYear();
  const month = calMonth.getMonth();

  calMonthLabel.textContent = calMonth.toLocaleString('en-US', {
    month: 'long', year: 'numeric'
  }).toUpperCase();

  const firstDow   = new Date(year, month, 1).getDay();
  const startOffset = firstDow === 0 ? 6 : firstDow - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);

  calGrid.innerHTML = '';

  for (let i = 0; i < startOffset; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-cell empty';
    calGrid.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const cell = document.createElement('button');
    cell.className = 'cal-cell';
    cell.textContent = d;

    if (dateStr === todayStr) cell.classList.add('today');
    if (dateStr > todayStr)   cell.classList.add('future');

    if (archiveDates.has(dateStr)) {
      cell.classList.add('has-data');
      const s = archiveSummaries.get(dateStr);
      if (s && s.total > 0) {
        const rate = Math.round((s.completed / s.total) * 100);
        cell.title = `${s.completed}/${s.total} done`;
        // color the dot: green ≥80%, orange 40–79%, red <40%
        cell.dataset.rate = rate >= 80 ? 'high' : rate >= 40 ? 'mid' : 'low';
      }
    }

    if (dateStr <= todayStr) {
      cell.addEventListener('click', () => loadHistoryDate(dateStr, cell));
    }

    calGrid.appendChild(cell);
  }
}

async function loadHistoryDate(dateStr, cell) {
  calGrid.querySelectorAll('.cal-cell.selected').forEach(c => c.classList.remove('selected'));
  cell.classList.add('selected');

  const todayStr = new Date().toISOString().slice(0, 10);
  let histTasks = [];

  if (dateStr === todayStr) {
    histTasks = tasks;
  } else {
    const archive = await api.getArchive(dateStr);
    histTasks = archive ? archive.tasks : [];
  }

  const d = new Date(dateStr + 'T12:00:00');
  historyDateLabel.textContent = d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  }).toUpperCase();

  // Mini summary line
  const done  = histTasks.filter(t => t.done).length;
  const total = histTasks.length;
  if (total > 0) {
    const catCounts = {};
    histTasks.forEach(t => { catCounts[t.category] = (catCounts[t.category] || 0) + 1; });
    const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];
    const topLabel = getCat(topCat[0]).label;
    historyDateLabel.title = `${done}/${total} done · top: ${topLabel} (${topCat[1]})`;
  }

  historyTaskList.innerHTML = '';
  historyEmptyState.classList.toggle('visible', histTasks.length === 0);

  if (histTasks.length === 0) {
    historyEmptyState.querySelector('p').textContent = 'no tasks that day';
    return;
  }

  // Summary chips above the list
  const summaryEl = document.createElement('div');
  summaryEl.className = 'history-summary-chips';
  summaryEl.innerHTML = `
    <span class="history-chip done-chip">${done}/${total} done</span>
    ${CATEGORIES.map(cat => {
      const n = histTasks.filter(t => (t.category || 'other') === cat.id).length;
      return n > 0
        ? `<span class="history-chip cat-chip" style="--cat-color:${cat.color}">${cat.label}: ${n}</span>`
        : '';
    }).join('')}
  `;
  historyTaskList.before(summaryEl);

  histTasks.forEach(t => {
    const cat = getCat(t.category);
    const li = document.createElement('li');
    li.className = 'task-item' + (t.done ? ' done' : '') + ' readonly';

    const chk = document.createElement('span');
    chk.className = 'task-checkbox' + (t.done ? ' checked' : '');

    const body = document.createElement('div');
    body.className = 'task-body';

    const txt = document.createElement('span');
    txt.className = 'task-text';
    txt.textContent = t.text;

    const catTag = document.createElement('span');
    catTag.className = 'task-cat-tag';
    catTag.textContent = cat.label;
    catTag.style.setProperty('--cat-color', cat.color);

    body.appendChild(txt);
    body.appendChild(catTag);
    li.appendChild(chk);
    li.appendChild(body);
    historyTaskList.appendChild(li);
  });
}

calPrev.addEventListener('click', () => {
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1);
  renderCalendar();
});
calNext.addEventListener('click', () => {
  const next = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1);
  if (next <= new Date()) { calMonth = next; renderCalendar(); }
});

// ── SUMMARY VIEW ───────────────────────────────────────────────────────────
async function initSummaryView() {
  const weekData = await api.getWeekData();
  renderWeekStrip(weekData);
  renderCategoryBars(weekData);
  renderStats(weekData);
  renderWeekHeader(weekData);
}

function renderWeekHeader(weekData) {
  const first = weekData[0].date;
  const last  = weekData[6].date;
  const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  weekHeaderEl.textContent = `${fmt(first)} – ${fmt(last)}`;
}

function renderWeekStrip(weekData) {
  weekDaysStrip.innerHTML = '';
  const todayStr = new Date().toISOString().slice(0, 10);

  weekData.forEach(({ date, dayName, tasks: dayTasks }) => {
    const total = dayTasks.length;
    const done  = dayTasks.filter(t => t.done).length;
    const pct   = total === 0 ? 0 : Math.round((done / total) * 100);
    const isFuture = date > todayStr;
    const isToday  = date === todayStr;

    const card = document.createElement('div');
    card.className = 'day-card' + (isToday ? ' today' : '') + (isFuture ? ' future' : '');

    const label = document.createElement('span');
    label.className = 'day-card-name';
    label.textContent = dayName.slice(0, 2);

    const count = document.createElement('span');
    count.className = 'day-card-count';
    count.textContent = isFuture ? '–' : (total === 0 ? '0' : `${done}/${total}`);

    const bar = document.createElement('div');
    bar.className = 'day-card-bar';
    const fill = document.createElement('div');
    fill.className = 'day-card-bar-fill';
    fill.style.height = isFuture ? '0%' : `${pct}%`;
    bar.appendChild(fill);

    card.appendChild(label);
    card.appendChild(bar);
    card.appendChild(count);
    weekDaysStrip.appendChild(card);
  });
}

function renderCategoryBars(weekData) {
  categoryBarsEl.innerHTML = '';
  const allTasks = weekData.flatMap(d => d.tasks);

  CATEGORIES.forEach(cat => {
    const catTasks = allTasks.filter(t => (t.category || 'other') === cat.id);
    const total = catTasks.length;
    const done  = catTasks.filter(t => t.done).length;
    const pct   = total === 0 ? 0 : Math.round((done / total) * 100);

    const row = document.createElement('div');
    row.className = 'cat-bar-row';

    const nameEl = document.createElement('span');
    nameEl.className = 'cat-bar-name';
    nameEl.textContent = cat.label.toUpperCase();
    nameEl.style.color = cat.color;

    const track = document.createElement('div');
    track.className = 'cat-bar-track';

    const fill = document.createElement('div');
    fill.className = 'cat-bar-fill';
    fill.style.width = `${pct}%`;
    fill.style.background = cat.color;
    track.appendChild(fill);

    const countEl = document.createElement('span');
    countEl.className = 'cat-bar-count';
    countEl.textContent = total === 0 ? 'none' : `${done}/${total}`;

    row.appendChild(nameEl);
    row.appendChild(track);
    row.appendChild(countEl);
    categoryBarsEl.appendChild(row);
  });
}

function renderStats(weekData) {
  statsRowEl.innerHTML = '';
  const todayStr = new Date().toISOString().slice(0, 10);
  const pastDays = weekData.filter(d => d.date <= todayStr);
  const allTasks = pastDays.flatMap(d => d.tasks);
  const total    = allTasks.length;
  const done     = allTasks.filter(t => t.done).length;
  const pct      = total === 0 ? 0 : Math.round((done / total) * 100);

  let busiestDay = '–';
  let maxTasks = 0;
  pastDays.forEach(({ dayName, tasks: dt }) => {
    if (dt.length > maxTasks) { maxTasks = dt.length; busiestDay = dayName; }
  });

  [
    { label: 'TOTAL',   value: total },
    { label: 'DONE',    value: done },
    { label: 'RATE',    value: `${pct}%` },
    { label: 'BUSIEST', value: busiestDay },
  ].forEach(({ label, value }) => {
    const card = document.createElement('div');
    card.className = 'stat-card';
    const val = document.createElement('span');
    val.className = 'stat-value';
    val.textContent = value;
    const lbl = document.createElement('span');
    lbl.className = 'stat-label';
    lbl.textContent = label;
    card.appendChild(val);
    card.appendChild(lbl);
    statsRowEl.appendChild(card);
  });
}

// ── Day reset ──────────────────────────────────────────────────────────────
api.onDayReset(() => {
  tasks = [];
  renderTaskList();
  loadDate();
  dateDayEl.classList.add('resetting');
  setTimeout(() => dateDayEl.classList.remove('resetting'), 1300);
  checkCarryOver();
});

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  tasks = await api.getTasks();
  renderTaskList();
  checkCarryOver();
}

init();
