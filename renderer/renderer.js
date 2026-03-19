const api = window.todoDoddle;

// ── Categories ─────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'finance',   label: 'Finance',       color: '#f472b6' },
  { id: 'sales',     label: 'Sales Ops',     color: '#a78bfa' },
  { id: 'legal',     label: 'Legal',         color: '#38bdf8' },
  { id: 'marketing', label: 'Marketing',     color: '#fb923c' },
  { id: 'reprel',    label: 'Rep Relations', color: '#34d399' },
  { id: 'hr',        label: 'HR',            color: '#fbbf24' },
];

function getCat(id) {
  return CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
}

// ── State ──────────────────────────────────────────────────────────────────
let tasks = [];
let currentTab = 'today';
let selectedCategory = 'hr';
let currentMonthData = null;
let currentMonthName = '';
let calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let archiveDates = new Set();
let archiveSummaries = new Map(); // date -> { total, completed }
let weekOffset = 0; // 0 = current week, -1 = last week, etc.

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

const histDetail      = document.getElementById('hist-detail');
const histDetailDate  = document.getElementById('hist-detail-date');
const histDetailSumm  = document.getElementById('hist-detail-summary');
const histDetailList  = document.getElementById('hist-detail-list');
const histDetailEmpty = document.getElementById('hist-detail-empty');

const weekDaysStrip   = document.getElementById('week-days-strip');
const categoryBarsEl  = document.getElementById('category-bars');
const statsRowEl      = document.getElementById('stats-row');
const weekHeaderEl    = document.getElementById('week-header');
const weekPrev        = document.getElementById('week-prev');
const weekNext        = document.getElementById('week-next');

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

  // ── Avatar rider ──────────────────────────────────────────────
  const rider = document.getElementById('avatar-rider');
  if (!rider) return;

  // State
  const prevState = rider.dataset.state;
  if      (total === 0)        rider.dataset.state = 'none';
  else if (done === total)     rider.dataset.state = 'done';
  else if (pct >= 50)          rider.dataset.state = 'ok';
  else                         rider.dataset.state = 'sad';

  // Swap image based on state
  const gojoImg = document.getElementById('gojo-img');
  if (gojoImg) {
    gojoImg.src = rider.dataset.state === 'done' ? 'gojohappy.png' : 'gojosad.png';
  }

  rider.style.opacity = total === 0 ? '0' : '1';

  // Position: right edge of fill, relative to .progress-section
  const track      = progressBar.parentElement;
  const trackLeft  = track.offsetLeft;
  const trackWidth = track.offsetWidth;
  const fillRight  = trackLeft + (pct / 100) * trackWidth;
  const clampedX   = Math.max(trackLeft + 24, Math.min(fillRight, trackLeft + trackWidth));
  rider.style.left = clampedX + 'px';
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
async function handlePrioritize(id, li, pinBtn) {
  tasks = await api.prioritizeTask(id);
  const task = tasks.find(t => t.id === id);
  const isPriority = task?.priority || false;
  li.classList.toggle('priority', isPriority);
  pinBtn.classList.toggle('active', isPriority);
  pinBtn.title = isPriority ? 'Unpin task' : 'Pin to top';
  renderTaskList();
}

function createTaskEl(task, isNew = false) {
  const li = document.createElement('li');
  li.className = 'task-item' +
    (task.done     ? ' done'     : '') +
    (task.priority ? ' priority' : '') +
    (isNew         ? ' new-task' : '');
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

  const pin = document.createElement('button');
  pin.className = 'btn-pin' + (task.priority ? ' active' : '');
  pin.textContent = '📌';
  pin.title = task.priority ? 'Unpin task' : 'Pin to top';
  pin.setAttribute('aria-label', pin.title);
  pin.addEventListener('click', () => handlePrioritize(task.id, li, pin));

  const del = document.createElement('button');
  del.className = 'btn-delete';
  del.textContent = '×';
  del.setAttribute('aria-label', 'Delete task');
  del.addEventListener('click', () => handleDelete(task.id, li));

  li.appendChild(handle);
  li.appendChild(chk);
  li.appendChild(body);
  li.appendChild(pin);
  li.appendChild(del);
  return li;
}

function renderTaskList() {
  taskList.innerHTML = '';
  const sorted = [
    ...tasks.filter(t => t.priority && !t.done),
    ...tasks.filter(t => !t.priority && !t.done),
    ...tasks.filter(t => t.done),
  ];
  sorted.forEach(t => taskList.appendChild(createTaskEl(t)));
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

function heatLevel(total) {
  if (total === 0) return 0;
  if (total <= 2)  return 1;
  if (total <= 4)  return 2;
  if (total <= 6)  return 3;
  return 4;
}

function renderCalendar() {
  const year  = calMonth.getFullYear();
  const month = calMonth.getMonth();

  calMonthLabel.textContent = calMonth.toLocaleString('en-US', {
    month: 'long', year: 'numeric'
  }).toUpperCase();

  const firstDow    = new Date(year, month, 1).getDay();
  const startOffset = firstDow === 0 ? 6 : firstDow - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr    = new Date().toISOString().slice(0, 10);

  calGrid.innerHTML = '';

  for (let i = 0; i < startOffset; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-cell empty';
    calGrid.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const cell    = document.createElement('button');
    cell.className   = 'cal-cell';
    cell.textContent = d;

    if (dateStr === todayStr) cell.classList.add('today');
    if (dateStr > todayStr)   cell.classList.add('future');

    if (archiveDates.has(dateStr)) {
      const s     = archiveSummaries.get(dateStr);
      const total = s ? s.total : 0;
      const done  = s ? s.completed : 0;
      const heat  = heatLevel(total);
      cell.dataset.heat = heat;

      if (total > 0) {
        const pct     = Math.round((done / total) * 100);
        const allDone = done === total;
        // Top category
        const topCat  = s.topCategory ? getCat(s.topCategory).label : '';
        cell.title    = `${done}/${total} done (${pct}%)${topCat ? ' · ' + topCat : ''}`;
        if (allDone) cell.dataset.alldone = '1';
      }
    } else if (dateStr < todayStr) {
      cell.dataset.heat = 0;
    }

    // Click → show day detail
    cell.dataset.date = dateStr;

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
  const isToday  = dateStr === todayStr;
  const histTasks = isToday
    ? tasks
    : ((await api.getArchive(dateStr))?.tasks || []);

  const d = new Date(dateStr + 'T12:00:00');
  histDetailDate.textContent = d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  }).toUpperCase();

  function refreshSummary() {
    const rows  = [...histDetailList.querySelectorAll('.hist-task-row')];
    const doneN = rows.filter(r => r.classList.contains('done')).length;
    histDetailSumm.textContent = rows.length > 0 ? `${doneN} / ${rows.length} done` : '';
    histDetailEmpty.classList.toggle('hidden', rows.length > 0);
  }

  const done  = histTasks.filter(t => t.done).length;
  const total = histTasks.length;
  histDetailSumm.textContent = total > 0 ? `${done} / ${total} done` : '';

  histDetailList.innerHTML = '';
  histDetailEmpty.classList.toggle('hidden', total > 0);

  histTasks.forEach(t => {
    const cat = getCat(t.category);
    const li  = document.createElement('li');
    li.className = 'hist-task-row' + (t.done ? ' done' : '');

    const chk = document.createElement('span');
    chk.className   = 'hist-task-chk';
    chk.textContent = t.done ? '✓' : '○';

    const txt = document.createElement('span');
    txt.className   = 'hist-task-txt';
    txt.textContent = t.text;

    const tag = document.createElement('span');
    tag.className = 'task-cat-tag';
    tag.textContent = cat.label;
    tag.style.setProperty('--cat-color', cat.color);

    const del = document.createElement('button');
    del.className = 'hist-task-del';
    del.textContent = '×';
    del.title = 'Delete task';
    del.addEventListener('click', async () => {
      li.classList.add('removing');
      await new Promise(r => setTimeout(r, 200));
      if (isToday) {
        tasks = await api.deleteTask(t.id);
      } else {
        await api.deleteArchivedTask(dateStr, t.id);
      }
      li.remove();
      refreshSummary();
      // Refresh calendar heatmap
      const summaries = await api.listArchiveSummaries();
      archiveSummaries = new Map(summaries.map(s => [s.date, s]));
      archiveDates     = new Set(summaries.map(s => s.date));
      renderCalendar();
      // Re-select the same cell after re-render
      const newCell = calGrid.querySelector(`[data-date="${dateStr}"]`);
      if (newCell) newCell.classList.add('selected');
    });

    li.appendChild(chk);
    li.appendChild(txt);
    li.appendChild(tag);
    li.appendChild(del);
    histDetailList.appendChild(li);
  });

  histDetail.classList.remove('hidden');
}

calPrev.addEventListener('click', () => {
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1);
  renderCalendar();
});
calNext.addEventListener('click', () => {
  const next = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1);
  if (next <= new Date()) { calMonth = next; renderCalendar(); }
});

// ── SUMMARY VIEW — helpers ─────────────────────────────────────────────────
async function fetchWeekData(offsetWeeks = 0) {
  if (offsetWeeks === 0) return await api.getWeekData();
  const d   = new Date();
  const dow = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow) + offsetWeeks * 7);
  monday.setHours(0, 0, 0, 0);
  const todayStr = new Date().toISOString().slice(0, 10);
  const week = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    const dateStr = day.toISOString().slice(0, 10);
    let dayTasks = [];
    if (dateStr === todayStr)       dayTasks = await api.getTasks();
    else if (dateStr < todayStr)    dayTasks = (await api.getArchive(dateStr))?.tasks || [];
    week.push({ date: dateStr, dayName: day.toLocaleString('en-US', { weekday: 'short' }).toUpperCase(), tasks: dayTasks });
  }
  return week;
}

async function fetchMonthData(year, month) {
  const todayStr    = new Date().toISOString().slice(0, 10);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (dateStr > todayStr) break;
    const dayTasks = dateStr === todayStr
      ? await api.getTasks()
      : (await api.getArchive(dateStr))?.tasks || [];
    days.push({ date: dateStr, tasks: dayTasks });
  }
  const allTasks    = days.flatMap(d => d.tasks);
  const total       = allTasks.length;
  const completed   = allTasks.filter(t => t.done).length;
  const rate        = total === 0 ? 0 : Math.round((completed / total) * 100);
  const activeDays  = days.filter(d => d.tasks.length > 0);
  const perfectDays = activeDays.filter(d => d.tasks.every(t => t.done)).length;
  const avgPerDay   = activeDays.length === 0 ? 0 : +(total / activeDays.length).toFixed(1);
  let maxStreak = 0, cur = 0;
  days.forEach(d => { d.tasks.length > 0 ? (maxStreak = Math.max(maxStreak, ++cur)) : (cur = 0); });
  const catCounts = {};
  allTasks.forEach(t => { const c = t.category || 'other'; catCounts[c] = (catCounts[c] || 0) + 1; });
  const topCat  = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];
  let bestDay = null, bestCount = 0;
  days.forEach(d => { const n = d.tasks.filter(t => t.done).length; if (n > bestCount) { bestCount = n; bestDay = d.date; } });
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    const wT = chunk.flatMap(d => d.tasks).length;
    const wD = chunk.flatMap(d => d.tasks).filter(t => t.done).length;
    weeks.push({ total: wT, done: wD, rate: wT === 0 ? 0 : Math.round((wD / wT) * 100) });
  }
  return { days, kpis: { total, completed, rate, perfectDays, avgPerDay, maxStreak, topCategory: topCat?.[0] ?? null, bestDay, weeks } };
}

// ── SUMMARY VIEW ───────────────────────────────────────────────────────────
async function initSummaryView() {
  const weekData = await fetchWeekData(weekOffset);
  renderWeekHeader(weekData);
  renderWeekStrip(weekData);
  renderCategoryBars(weekData);
  renderStats(weekData);

  weekNext.disabled    = weekOffset === 0;
  weekNext.style.opacity = weekOffset === 0 ? '0.3' : '1';

  const now       = new Date();
  const monthData = await fetchMonthData(now.getFullYear(), now.getMonth());
  renderMonthlyKPIs(monthData, now);
}

function renderWeekHeader(weekData) {
  const fmt   = ds => new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const label = weekOffset === 0 ? 'THIS WEEK'
              : weekOffset === -1 ? 'LAST WEEK'
              : `${fmt(weekData[0].date)} – ${fmt(weekData[6].date)}`;
  weekHeaderEl.textContent = label;
}

weekPrev.addEventListener('click', async () => { weekOffset--; await initSummaryView(); });
weekNext.addEventListener('click', async () => { if (weekOffset < 0) { weekOffset++; await initSummaryView(); } });

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

function renderMonthlyKPIs(monthData, now) {
  currentMonthData = monthData;
  currentMonthName = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const { kpis } = monthData;
  const monthName = now.toLocaleString('en-US', { month: 'long' }).toUpperCase();
  document.getElementById('monthly-title-label').textContent = `${monthName} REPORT`;

  // KPI cards
  const grid = document.getElementById('monthly-kpi-grid');
  grid.innerHTML = '';
  const topCatLabel = kpis.topCategory ? getCat(kpis.topCategory).label : '–';
  const bestDayLabel = kpis.bestDay
    ? new Date(kpis.bestDay + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '–';

  [
    { icon: '📋', label: 'TOTAL',        value: kpis.total },
    { icon: '✅', label: 'DONE',         value: kpis.completed },
    { icon: '📈', label: 'RATE',         value: `${kpis.rate}%` },
    { icon: '⭐', label: 'PERFECT DAYS', value: kpis.perfectDays },
    { icon: '🔥', label: 'STREAK',       value: `${kpis.maxStreak}d` },
    { icon: '📊', label: 'AVG / DAY',    value: kpis.avgPerDay },
    { icon: '🏆', label: 'TOP CAT',      value: topCatLabel },
    { icon: '🎯', label: 'BEST DAY',     value: bestDayLabel },
  ].forEach(({ icon, label, value }) => {
    const card = document.createElement('div');
    card.className = 'monthly-kpi-card';
    card.innerHTML = `<span class="mkpi-icon">${icon}</span>
                      <span class="mkpi-value">${value}</span>
                      <span class="mkpi-label">${label}</span>`;
    grid.appendChild(card);
  });

  // Weekly breakdown bars
  const wbEl = document.getElementById('monthly-week-bars');
  wbEl.innerHTML = '';
  kpis.weeks.forEach((w, i) => {
    const row = document.createElement('div');
    row.className = 'mweek-row';
    const lbl = document.createElement('span');
    lbl.className = 'mweek-label';
    lbl.textContent = `W${i + 1}`;
    const track = document.createElement('div');
    track.className = 'mweek-track';
    const fill = document.createElement('div');
    fill.className = 'mweek-fill';
    fill.style.width = `${w.rate}%`;
    track.appendChild(fill);
    const cnt = document.createElement('span');
    cnt.className = 'mweek-count';
    cnt.textContent = w.total === 0 ? '–' : `${w.done}/${w.total}`;
    row.appendChild(lbl);
    row.appendChild(track);
    row.appendChild(cnt);
    wbEl.appendChild(row);
  });

  // Monthly category bars (clickable → drilldown modal)
  const mcEl = document.getElementById('monthly-cat-bars');
  mcEl.innerHTML = '';
  const allTasks = monthData.days.flatMap(d => d.tasks);
  CATEGORIES.forEach(cat => {
    const catT = allTasks.filter(t => (t.category || 'hr') === cat.id);
    const total = catT.length;
    const done  = catT.filter(t => t.done).length;
    const pct   = total === 0 ? 0 : Math.round((done / total) * 100);

    const row = document.createElement('div');
    row.className = 'cat-bar-row cat-bar-clickable';
    row.title = `View all ${cat.label} tasks`;
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => showCategoryModal(cat));

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

    const chevron = document.createElement('span');
    chevron.className = 'cat-bar-chevron';
    chevron.textContent = '›';

    row.appendChild(nameEl);
    row.appendChild(track);
    row.appendChild(countEl);
    row.appendChild(chevron);
    mcEl.appendChild(row);
  });
}

// ── Category drilldown modal ────────────────────────────────────────────────
function showCategoryModal(cat) {
  document.getElementById('cat-modal')?.remove();
  if (!currentMonthData) return;

  const dayTasks = currentMonthData.days.flatMap(d =>
    d.tasks
      .filter(t => (t.category || 'hr') === cat.id)
      .map(t => ({ ...t, date: d.date }))
  );
  const total = dayTasks.length;
  const done  = dayTasks.filter(t => t.done).length;

  const backdrop = document.createElement('div');
  backdrop.id = 'cat-modal';
  backdrop.className = 'cat-modal-backdrop';
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeCatModal(); });

  const card = document.createElement('div');
  card.className = 'cat-modal-card';

  const header = document.createElement('div');
  header.className = 'cat-modal-header';
  header.innerHTML = `
    <div>
      <div class="cat-modal-title" style="color:${cat.color}">${cat.label.toUpperCase()}</div>
      <div class="cat-modal-sub">${currentMonthName} · ${done}/${total} done</div>
    </div>
    <button class="cat-modal-close" aria-label="Close">×</button>
  `;
  header.querySelector('.cat-modal-close').addEventListener('click', closeCatModal);

  const body = document.createElement('div');
  body.className = 'cat-modal-body';

  if (dayTasks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'cat-modal-empty';
    empty.textContent = 'no tasks this month';
    body.appendChild(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'cat-modal-list';
    dayTasks.forEach(t => {
      const li = document.createElement('li');
      li.className = 'cat-modal-row' + (t.done ? ' done' : '');

      const status = document.createElement('span');
      status.className = 'cat-modal-status';
      status.textContent = t.done ? '✓' : '○';

      const dateEl = document.createElement('span');
      dateEl.className = 'cat-modal-date';
      dateEl.textContent = new Date(t.date + 'T12:00:00')
        .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      const textEl = document.createElement('span');
      textEl.className = 'cat-modal-text';
      textEl.textContent = t.text;

      li.appendChild(status);
      li.appendChild(dateEl);
      li.appendChild(textEl);
      list.appendChild(li);
    });
    body.appendChild(list);
  }

  card.appendChild(header);
  card.appendChild(body);
  backdrop.appendChild(card);
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('visible'));
}

function closeCatModal() {
  const modal = document.getElementById('cat-modal');
  if (!modal) return;
  modal.classList.remove('visible');
  modal.addEventListener('transitionend', () => modal.remove(), { once: true });
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
