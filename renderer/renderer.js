const api = window.todoDoddle;

// ── Categories ─────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'finance',   label: 'Finance',       color: '#f472b6' },
  { id: 'sales',     label: 'Sales Ops',     color: '#a78bfa' },
  { id: 'legal',     label: 'Legal',         color: '#38bdf8' },
  { id: 'marketing', label: 'Marketing',     color: '#fb923c' },
  { id: 'reprel',    label: 'Travel Ops', color: '#34d399' },
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
const estNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
let calMonth = new Date(estNow.getFullYear(), estNow.getMonth(), 1);
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

// ── Feature DOM refs ────────────────────────────────────────────────────────
const btnTime           = document.getElementById('btn-time');
const timePickerRow     = document.getElementById('time-picker-row');
const taskTimeInput     = document.getElementById('task-time-input');
const btnSchedule       = document.getElementById('btn-schedule');
const schedulePickerRow = document.getElementById('schedule-picker-row');
const taskDateInput     = document.getElementById('task-date-input');
const upcomingPanel     = document.getElementById('upcoming-panel');
const upcomingList      = document.getElementById('upcoming-list');
const upcomingCountBadge= document.getElementById('upcoming-count-badge');
const milestoneList  = document.getElementById('milestone-list');
const milestoneEmpty = document.getElementById('milestone-empty');
const msModalBackdrop= document.getElementById('milestone-modal-backdrop');
const msTitleInput   = document.getElementById('ms-title-input');
const msDateInput    = document.getElementById('ms-date-input');
const msCatSelect    = document.getElementById('ms-cat-select');

// ── Window controls ────────────────────────────────────────────────────────
btnMinimize.addEventListener('click', () => api.minimize());
btnClose.addEventListener('click',    () => api.close());

// ── Settings popover ───────────────────────────────────────────────────────
(function initSettings() {
  const btn      = document.getElementById('btn-settings');
  const popover  = document.getElementById('settings-popover');
  const sfxBtn   = document.getElementById('sfx-toggle');
  const themeBtns = document.querySelectorAll('.theme-btn');

  // open / close
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    popover.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!popover.contains(e.target) && e.target !== btn) {
      popover.classList.remove('open');
    }
  });

  // sound toggle
  function refreshSfxBtn() {
    const on = SoundFX.isOn();
    sfxBtn.textContent = on ? '🔊 ON' : '🔇 OFF';
    sfxBtn.classList.toggle('off', !on);
  }
  refreshSfxBtn();
  sfxBtn.addEventListener('click', () => { SoundFX.toggle(); refreshSfxBtn(); });

  // theme switching
  const saved = localStorage.getItem('theme') || '';
  document.body.dataset.theme = saved;
  themeBtns.forEach(b => b.classList.toggle('active', b.dataset.theme === saved));

  themeBtns.forEach(b => {
    b.addEventListener('click', () => {
      const t = b.dataset.theme;
      document.body.dataset.theme = t;
      localStorage.setItem('theme', t);
      themeBtns.forEach(x => x.classList.toggle('active', x === b));
    });
  });
})();

// ── Tab navigation ─────────────────────────────────────────────────────────
// #9: sliding tab indicator
function updateTabIndicator(activeBtn) {
  const indicator = document.getElementById('tab-indicator');
  if (!indicator || !activeBtn) return;
  indicator.style.left  = activeBtn.offsetLeft + 'px';
  indicator.style.width = activeBtn.offsetWidth + 'px';
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    if (tab === currentTab) return;
    currentTab = tab;

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    updateTabIndicator(btn);

    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(`view-${tab}`).classList.remove('hidden');

    if (tab === 'history')    initHistoryView();
    if (tab === 'summary')    initSummaryView();
    if (tab === 'milestones') renderMilestones();
  });
});
// init indicator on first load (disable transition so it snaps into place)
{
  const indicator = document.getElementById('tab-indicator');
  if (indicator) indicator.style.transition = 'none';
  updateTabIndicator(document.querySelector('.tab-btn.active'));
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (indicator) indicator.style.transition = '';
  }));
}

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
setInterval(() => {
  updateClock();
  // Refresh overdue badges every minute
  document.querySelectorAll('.task-time-badge').forEach(badge => {
    const task = tasks.find(t => t.dueTime && badge.dataset.due === t.dueTime);
    if (task) badge.classList.toggle('overdue', isOverdue(task));
  });
}, 60000);

// ── Date display ───────────────────────────────────────────────────────────
async function loadDate() {
  const d = await api.getDate();
  dateDayEl.textContent  = String(d.day).padStart(2, '0');
  dateMetaEl.textContent = `${d.weekday}  ${d.month}`;
  const monthEl = document.getElementById('date-month');
  if (monthEl) monthEl.textContent = d.month;
}
loadDate();

// ── Category pills (add-task form) ─────────────────────────────────────────
function renderCategoryPills() {
  categoryRow.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const pill = document.createElement('button');
    pill.className = 'cat-pill' + (cat.id === selectedCategory ? ' selected' : '');
    pill.innerHTML = `<span style="position:relative;z-index:1">${cat.label}</span>`;
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
  if      (total === 0)    rider.dataset.state = 'none';
  else if (done === total) rider.dataset.state = 'done';
  else if (pct >= 20)      rider.dataset.state = 'middle';
  else                     rider.dataset.state = 'sad';

  // Play gojodance sound once when transitioning to all-done
  if (rider.dataset.state === 'done' && prevState !== 'done') {
    SoundFX.gojoDance();
  }

  // Swap image with smooth crossfade
  const STATE_IMG = { done: 'gojohappy.png', middle: 'gojomiddle.png' };
  const newSrc = STATE_IMG[rider.dataset.state] || 'gojosad.png';
  const gojoImg = document.getElementById('gojo-img');
  if (gojoImg) {
    if (!gojoImg.src.endsWith(newSrc)) {
      // Fade out → swap src → fade in
      gojoImg.style.opacity = '0';
      setTimeout(() => {
        gojoImg.src = newSrc;
        gojoImg.style.opacity = '1';
      }, 220);
    } else if (!gojoImg.src || gojoImg.src === '') {
      gojoImg.src = newSrc; // first load — no fade
    }
  }

  // Inject / remove flying star particles
  const isDone = rider.dataset.state === 'done';
  const wasDone = prevState === 'done';
  if (isDone && !wasDone) {
    // Add 8 stars flying in different directions
    const STARS = [
      { emoji: '✦', anim: 'star-up',    delay: 0,    dur: 1.1 },
      { emoji: '★', anim: 'star-upL',   delay: 0.1,  dur: 1.0 },
      { emoji: '✶', anim: 'star-upR',   delay: 0.2,  dur: 1.2 },
      { emoji: '✦', anim: 'star-left',  delay: 0.3,  dur: 0.95 },
      { emoji: '✧', anim: 'star-right', delay: 0.15, dur: 1.05 },
      { emoji: '★', anim: 'star-upLL',  delay: 0.25, dur: 1.15 },
      { emoji: '✶', anim: 'star-upRR',  delay: 0.05, dur: 1.0 },
      { emoji: '✦', anim: 'star-upFar', delay: 0.35, dur: 1.3 },
    ];
    STARS.forEach(({ emoji, anim, delay, dur }) => {
      const el = document.createElement('span');
      el.className = 'star-particle';
      el.textContent = emoji;
      el.style.animationName      = anim;
      el.style.animationDuration  = `${dur}s`;
      el.style.animationDelay     = `${delay}s`;
      el.style.animationTimingFunction = 'ease-out';
      el.style.animationIterationCount = 'infinite';
      el.style.fontSize = `${11 + Math.floor(Math.random() * 5)}px`;
      rider.appendChild(el);
    });
  } else if (!isDone && wasDone) {
    // Clean up stars when leaving done state
    rider.querySelectorAll('.star-particle').forEach(el => el.remove());
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
  isPriority ? SoundFX.pin() : SoundFX.unpin();
  li.classList.toggle('priority', isPriority);
  pinBtn.classList.toggle('active', isPriority);
  pinBtn.title = isPriority ? 'Unpin task' : 'Pin to top';
  // Swap image immediately on toggle
  const img = pinBtn.querySelector('.sukuna-pin-img');
  if (img) img.src = isPriority ? 'sukuna.png' : 'normalsukuna.png';
  renderTaskList();
  // Shake the newly-rendered element when pinned
  if (isPriority) {
    const newLi = taskList.querySelector(`[data-id="${id}"]`);
    if (newLi) {
      newLi.classList.add('just-pinned');
      setTimeout(() => newLi.classList.remove('just-pinned'), 700);
    }
  }
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

  // top row: text + time badge + notes dot
  const topRow = document.createElement('div');
  topRow.style.cssText = 'display:flex;align-items:center;gap:4px;width:100%';

  const txt = document.createElement('span');
  txt.className   = 'task-text';
  txt.textContent = task.text;
  txt.title       = 'Click to scratch off · Double-click to edit';
  // Single-click on text = toggle done; double-click = edit
  let _clickTimer = null;
  txt.addEventListener('click', (e) => {
    e.stopPropagation(); // don't bubble to body (notes expand)
    if (_clickTimer) { clearTimeout(_clickTimer); _clickTimer = null; return; }
    _clickTimer = setTimeout(() => { _clickTimer = null; handleToggle(task.id, li); }, 220);
  });
  txt.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    if (_clickTimer) { clearTimeout(_clickTimer); _clickTimer = null; }
    startEdit(task, txt);
  });

  topRow.appendChild(txt);

  // Feature 1: time badge
  if (task.dueTime) {
    const badge = document.createElement('span');
    badge.className = 'task-time-badge';
    badge.textContent = formatTime12(task.dueTime);
    badge.dataset.due = task.dueTime;
    if (isOverdue(task)) badge.classList.add('overdue');
    topRow.appendChild(badge);
  }

  // Feature 3: notes indicator dot
  const notesDot = document.createElement('span');
  notesDot.className = 'task-notes-indicator' + (task.notes ? ' has-notes' : '');
  notesDot.title = 'Has note';
  topRow.appendChild(notesDot);

  const catTag = document.createElement('span');
  catTag.className = 'task-cat-tag';
  catTag.textContent = cat.label;
  catTag.style.setProperty('--cat-color', cat.color);

  body.appendChild(topRow);
  body.appendChild(catTag);

  // Feature 3: notes expandable area
  const notesArea = document.createElement('div');
  notesArea.className = 'task-notes-area' + (task.notes ? ' expanded' : '');
  const notesInput = document.createElement('input');
  notesInput.type = 'text';
  notesInput.className = 'task-notes-input';
  notesInput.placeholder = 'add a note...';
  notesInput.value = task.notes || '';
  notesInput.addEventListener('blur', async () => {
    const val = notesInput.value.trim();
    await api.updateNotes(task.id, val);
    tasks = await api.getTasks();
    notesDot.classList.toggle('has-notes', !!val);
  });
  notesInput.addEventListener('click', e => e.stopPropagation());
  notesArea.appendChild(notesInput);
  body.appendChild(notesArea);

  // Toggle notes on task body click
  body.addEventListener('click', () => {
    notesArea.classList.toggle('expanded');
    if (notesArea.classList.contains('expanded')) notesInput.focus();
  });

  const pin = document.createElement('button');
  pin.className = 'btn-pin' + (task.priority ? ' active' : '');
  pin.innerHTML = `<img src="${task.priority ? 'sukuna.png' : 'normalsukuna.png'}" class="sukuna-pin-img" draggable="false" alt="pin" />`;
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

// ── Helper: format "HH:MM" → "3:30 PM" ─────────────────────────────────────
function formatTime12(t) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2,'0')} ${ampm}`;
}

// ── Helper: is task overdue? ────────────────────────────────────────────────
function isOverdue(task) {
  if (!task.dueTime || task.done) return false;
  const now = new Date();
  const [h, m] = task.dueTime.split(':').map(Number);
  return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
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
// ── Custom Time Picker ─────────────────────────────────────────────────────
(function initTimePicker() {
  const hoursCol  = document.getElementById('ctp-hours');
  const minsCol   = document.getElementById('ctp-mins');
  const amBtn     = document.getElementById('ctp-am');
  const pmBtn     = document.getElementById('ctp-pm');
  const confirmBtn= document.getElementById('ctp-confirm');

  let selHour = 8, selMin = 0, selAmPm = 'AM';

  // Build hour items 1–12
  for (let h = 1; h <= 12; h++) {
    const el = document.createElement('div');
    el.className = 'ctp-item' + (h === selHour ? ' selected' : '');
    el.textContent = String(h).padStart(2, '0');
    el.dataset.val = h;
    el.addEventListener('click', () => {
      selHour = h;
      hoursCol.querySelectorAll('.ctp-item').forEach(i => i.classList.toggle('selected', Number(i.dataset.val) === selHour));
    });
    hoursCol.appendChild(el);
  }

  // Build minute items 0, 5, 10 … 55
  for (let m = 0; m < 60; m += 5) {
    const el = document.createElement('div');
    el.className = 'ctp-item' + (m === selMin ? ' selected' : '');
    el.textContent = String(m).padStart(2, '0');
    el.dataset.val = m;
    el.addEventListener('click', () => {
      selMin = m;
      minsCol.querySelectorAll('.ctp-item').forEach(i => i.classList.toggle('selected', Number(i.dataset.val) === selMin));
    });
    minsCol.appendChild(el);
  }

  // AM / PM toggle
  amBtn.addEventListener('click', () => { selAmPm = 'AM'; amBtn.classList.add('active'); pmBtn.classList.remove('active'); });
  pmBtn.addEventListener('click', () => { selAmPm = 'PM'; pmBtn.classList.add('active'); amBtn.classList.remove('active'); });

  // Confirm → write "HH:MM" (24h) into hidden input + update button label
  confirmBtn.addEventListener('click', () => {
    let h24 = selHour % 12;
    if (selAmPm === 'PM') h24 += 12;
    taskTimeInput.value = `${String(h24).padStart(2,'0')}:${String(selMin).padStart(2,'0')}`;
    btnTime.textContent = `🕐 ${selHour}:${String(selMin).padStart(2,'0')} ${selAmPm}`;
    timePickerRow.classList.add('hidden');
    btnTime.classList.add('active');
  });

  // Scroll to selected items on open
  function scrollToSelected() {
    const selH = hoursCol.querySelector('.selected');
    const selM = minsCol.querySelector('.selected');
    if (selH) selH.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (selM) selM.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  // Toggle open/close
  btnTime.addEventListener('click', () => {
    const isHidden = timePickerRow.classList.toggle('hidden');
    if (!isHidden) setTimeout(scrollToSelected, 50);
    if (isHidden && !taskTimeInput.value) btnTime.textContent = '🕐';
  });

  // Clear button
  document.getElementById('time-clear-btn').addEventListener('click', () => {
    taskTimeInput.value = '';
    btnTime.textContent = '🕐';
    timePickerRow.classList.add('hidden');
    btnTime.classList.remove('active');
  });
})();

const localDateStr = (d = new Date()) => {
  // Convert to EST timezone
  const estDate = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return `${estDate.getFullYear()}-${String(estDate.getMonth()+1).padStart(2,'0')}-${String(estDate.getDate()).padStart(2,'0')}`;
};
const todayIso = () => localDateStr();

// ── Schedule for future date toggle ────────────────────────────────────────
btnSchedule.addEventListener('click', () => {
  const hidden = schedulePickerRow.classList.toggle('hidden');
  btnSchedule.classList.toggle('active', !hidden);
  if (!hidden) {
    if (!taskDateInput.value) {
      const estDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const tomorrow = new Date(estDate);
      tomorrow.setDate(tomorrow.getDate() + 1);
      taskDateInput.value = localDateStr(tomorrow);
    }
    taskDateInput.focus();
  }
});
document.getElementById('schedule-clear-btn').addEventListener('click', () => {
  taskDateInput.value = '';
  schedulePickerRow.classList.add('hidden');
  btnSchedule.classList.remove('active');
});

async function handleAdd() {
  const text = taskInput.value.trim();
  if (!text) return;
  const dueTime      = taskTimeInput.value || '';
  const scheduleDate = taskDateInput.value || '';

  taskInput.value = '';
  taskTimeInput.value = '';
  taskDateInput.value = '';
  timePickerRow.classList.add('hidden');
  schedulePickerRow.classList.add('hidden');
  btnTime.classList.remove('active');
  btnTime.textContent = '🕐';
  btnSchedule.classList.remove('active');

  // Future date → scheduled queue
  if (scheduleDate && scheduleDate > todayIso()) {
    await api.addScheduledTask(text, selectedCategory, dueTime, scheduleDate);
    await renderUpcoming();
    upcomingPanel.classList.remove('hidden');
    upcomingPanel.classList.add('open');
    return;
  }

  // Today → normal active task
  const task = await api.addTask(text, selectedCategory, dueTime);
  if (!task) return;
  SoundFX.addTask();
  tasks.push(task);
  const li = createTaskEl(task, true);
  taskList.appendChild(li);
  updateProgress();
  li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function handleToggle(id, li) {
  let updated;
  try { updated = await api.toggleTask(id); } catch (e) { console.error('toggleTask error:', e); return; }
  tasks = updated;
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  if (task.done) {
    SoundFX.complete();
    li.classList.add('done', 'just-done');
    const cb = li.querySelector('.task-checkbox');
    cb.classList.add('checked');
    // #4: cursed energy burst ripple
    const ripple = document.createElement('span');
    ripple.className = 'checkbox-ripple';
    cb.appendChild(ripple);
    setTimeout(() => ripple.remove(), 500);
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
  const todayStr    = todayIso();

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

    cell.dataset.date = dateStr;

    if (dateStr <= todayStr) {
      cell.addEventListener('click', () => loadHistoryDate(dateStr, cell));
    } else {
      // Future date — clickable for scheduling
      cell.addEventListener('click', () => loadFutureDate(dateStr, cell));
    }

    calGrid.appendChild(cell);
  }

}

async function loadHistoryDate(dateStr, cell) {
  calGrid.querySelectorAll('.cal-cell.selected').forEach(c => c.classList.remove('selected'));
  cell.classList.add('selected');
  futureDateActive = null;
  document.getElementById('future-add-section').classList.add('hidden');

  const todayStr = todayIso();
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
  const todayStr = todayIso();
  const week = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    const dateStr = localDateStr(day);
    let dayTasks = [];
    if (dateStr === todayStr)       dayTasks = await api.getTasks();
    else if (dateStr < todayStr)    dayTasks = (await api.getArchive(dateStr))?.tasks || [];
    week.push({ date: dateStr, dayName: day.toLocaleString('en-US', { weekday: 'short' }).toUpperCase(), tasks: dayTasks });
  }
  return week;
}

async function fetchMonthData(year, month) {
  const todayStr    = todayIso();
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

// ── FUTURE DATE: click to plan ─────────────────────────────────────────────
let futureDateActive  = null;
let futureSelCategory = 'hr';

async function loadFutureDate(dateStr, cell) {
  calGrid.querySelectorAll('.cal-cell.selected').forEach(c => c.classList.remove('selected'));
  cell.classList.add('selected');
  futureDateActive = dateStr;

  // Reuse the same hist-detail panel
  const d = new Date(dateStr + 'T12:00:00');
  histDetailDate.textContent = d.toLocaleDateString('en-US',
    { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
  histDetailSumm.textContent = '';

  // Build category pills once
  const futureCatRow = document.getElementById('future-category-row');
  if (!futureCatRow.dataset.built) {
    futureCatRow.dataset.built = '1';
    CATEGORIES.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'cat-pill' + (cat.id === futureSelCategory ? ' active' : '');
      btn.textContent = cat.label;
      btn.style.setProperty('--cat-color', cat.color);
      btn.dataset.catId = cat.id;
      btn.addEventListener('click', () => {
        futureSelCategory = cat.id;
        futureCatRow.querySelectorAll('.cat-pill').forEach(p =>
          p.classList.toggle('active', p.dataset.catId === cat.id));
      });
      futureCatRow.appendChild(btn);
    });
  }

  // Show add-section, load existing scheduled tasks into the list
  document.getElementById('future-add-section').classList.remove('hidden');
  histDetail.classList.remove('hidden');
  await loadScheduledTasksIntoList(dateStr);
  document.getElementById('future-task-input').focus();
}

async function loadScheduledTasksIntoList(dateStr) {
  const all    = await api.getScheduledTasks();
  const forDay = all.filter(t => t.scheduledDate === dateStr);
  histDetailList.innerHTML = '';
  histDetailEmpty.classList.toggle('hidden', forDay.length > 0);
  histDetailSumm.textContent = forDay.length ? `${forDay.length} planned` : '';

  forDay.forEach(t => {
    const cat = getCat(t.category);
    const li  = document.createElement('li');
    li.className = 'hist-task-row';                         // reuse existing row style

    const colorBar = document.createElement('span');
    colorBar.style.cssText = `display:inline-block;width:3px;min-height:16px;border-radius:2px;background:${cat.color};margin-right:6px;flex-shrink:0`;

    const txt = document.createElement('span');
    txt.className = 'hist-task-txt';
    txt.textContent = t.text;

    const catTag = document.createElement('span');
    catTag.className = 'task-cat-tag';
    catTag.textContent = cat.label;
    catTag.style.setProperty('--cat-color', cat.color);
    catTag.style.cssText += ';margin-left:6px';

    const del = document.createElement('button');
    del.className = 'hist-task-del';
    del.textContent = '×';
    del.addEventListener('click', async () => {
      li.style.opacity = '0';
      li.style.transition = 'opacity 0.18s';
      await new Promise(r => setTimeout(r, 180));
      await api.deleteScheduledTask(t.id);
      const rem = (await api.getScheduledTasks()).filter(s => s.scheduledDate === dateStr);
      const c = calGrid.querySelector(`[data-date="${dateStr}"]`);

      loadScheduledTasksIntoList(dateStr);
    });

    li.appendChild(colorBar);
    li.appendChild(txt);
    li.appendChild(catTag);
    li.appendChild(del);
    histDetailList.appendChild(li);
  });
}

document.getElementById('future-btn-add').addEventListener('click', addFutureTask);
document.getElementById('future-task-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') addFutureTask();
});

async function addFutureTask() {
  const input = document.getElementById('future-task-input');
  const text  = input.value.trim();
  if (!text || !futureDateActive) return;
  input.value = '';
  await api.addScheduledTask(text, futureSelCategory, '', futureDateActive);
  const c = calGrid.querySelector(`[data-date="${futureDateActive}"]`);

  loadScheduledTasksIntoList(futureDateActive);
  input.focus();
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
  const todayStr = todayIso();

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

  const kpiIcons = {
    TOTAL:         `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="12" height="12" rx="2" stroke="#c026d3" stroke-width="1.5"/><line x1="5" y1="5.5" x2="11" y2="5.5" stroke="#c026d3" stroke-width="1.2" stroke-linecap="round"/><line x1="5" y1="8" x2="11" y2="8" stroke="#c026d3" stroke-width="1.2" stroke-linecap="round"/><line x1="5" y1="10.5" x2="8.5" y2="10.5" stroke="#c026d3" stroke-width="1.2" stroke-linecap="round"/></svg>`,
    DONE:          `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="5.5" stroke="#c026d3" stroke-width="1.5"/><polyline points="5.5,8 7.2,9.8 10.5,6.2" stroke="#c026d3" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    RATE:          `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><polyline points="2,12 6,7 9,10 14,4" stroke="#c026d3" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><polyline points="11,4 14,4 14,7" stroke="#c026d3" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    'PERFECT DAYS':`<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><polygon points="8,2 9.8,6.2 14.2,6.5 11,9.5 12,13.8 8,11.5 4,13.8 5,9.5 1.8,6.5 6.2,6.2" stroke="#c026d3" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
    STREAK:        `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 2 C9 2 11 5 9.5 7 C11 6.5 13 8 11.5 11 C12.5 10.5 13.5 12 12 13.5 C10.5 14.8 7.5 15 6 13 C4 11 5 8.5 7 8 C6 6.5 6.5 4 9 2Z" stroke="#c026d3" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
    'AVG / DAY':   `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="9" width="2.5" height="5" rx="0.5" fill="#c026d3"/><rect x="6" y="6" width="2.5" height="8" rx="0.5" fill="#c026d3"/><rect x="10" y="3.5" width="2.5" height="10.5" rx="0.5" fill="#c026d3"/><line x1="2" y1="14.5" x2="14" y2="14.5" stroke="#c026d3" stroke-width="1" stroke-linecap="round"/></svg>`,
    'TOP CAT':     `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><polygon points="8,2 14,13.5 2,13.5" stroke="#c026d3" stroke-width="1.3" stroke-linejoin="round"/><line x1="8" y1="6" x2="8" y2="10" stroke="#c026d3" stroke-width="1.3" stroke-linecap="round"/><circle cx="8" cy="12" r="0.7" fill="#c026d3"/></svg>`,
    'BEST DAY':    `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="3" width="12" height="11" rx="1.5" stroke="#c026d3" stroke-width="1.3"/><line x1="5.5" y1="2" x2="5.5" y2="5" stroke="#c026d3" stroke-width="1.3" stroke-linecap="round"/><line x1="10.5" y1="2" x2="10.5" y2="5" stroke="#c026d3" stroke-width="1.3" stroke-linecap="round"/><line x1="2" y1="7" x2="14" y2="7" stroke="#c026d3" stroke-width="1"/><circle cx="8" cy="10.5" r="1.5" fill="#c026d3"/></svg>`,
  };

  [
    { label: 'TOTAL',        value: kpis.total },
    { label: 'DONE',         value: kpis.completed },
    { label: 'RATE',         value: `${kpis.rate}%` },
    { label: 'PERFECT DAYS', value: kpis.perfectDays },
    { label: 'STREAK',       value: `${kpis.maxStreak}d` },
    { label: 'AVG / DAY',    value: kpis.avgPerDay },
    { label: 'TOP CAT',      value: topCatLabel },
    { label: 'BEST DAY',     value: bestDayLabel },
  ].forEach(({ label, value }) => {
    const card = document.createElement('div');
    card.className = 'monthly-kpi-card';
    card.innerHTML = `<span class="mkpi-icon">${kpiIcons[label] || ''}</span>
                      <span class="mkpi-value">${value}</span>
                      <span class="mkpi-label">${label}</span>`;
    // #3: 3D tilt on mousemove
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      const x = ((e.clientX - r.left)  / r.width  - 0.5) * 2;
      const y = ((e.clientY - r.top)   / r.height - 0.5) * 2;
      card.style.transform = `perspective(280px) rotateY(${x * 9}deg) rotateX(${-y * 9}deg) scale(1.06)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
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

  // Feature 4: Sparkline trend line
  const sparkWrap = document.getElementById('sparkline-wrap');
  sparkWrap.innerHTML = '';
  if (monthData.days && monthData.days.length > 1) {
    const pts = monthData.days.map(d => {
      const tot = d.tasks.length;
      return tot === 0 ? null : Math.round((d.tasks.filter(t => t.done).length / tot) * 100);
    });
    const valid = pts.filter(p => p !== null);
    if (valid.length > 0) {
      const W = 280, H = 48, pad = 6;
      const xStep = (W - pad * 2) / Math.max(pts.length - 1, 1);
      const coords = pts.map((p, i) => {
        const x = pad + i * xStep;
        const y = p === null ? null : pad + (H - pad * 2) * (1 - p / 100);
        return { x, y, v: p };
      });
      const linePoints = coords.filter(c => c.y !== null).map(c => `${c.x},${c.y}`).join(' ');
      const areaPoints = coords.filter(c => c.y !== null).map(c => `${c.x},${c.y}`).join(' ');
      const firstValid = coords.find(c => c.y !== null);
      const lastValid  = [...coords].reverse().find(c => c.y !== null);
      const areaPath   = `${firstValid.x},${H - pad} ${areaPoints} ${lastValid.x},${H - pad}`;
      const maxVal = Math.max(...valid);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.classList.add('sparkline');
      svg.innerHTML = `
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="var(--color-accent)" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="var(--color-accent)" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <line x1="${pad}" y1="${H-pad}" x2="${W-pad}" y2="${H-pad}" stroke="var(--color-border)" stroke-width="0.8" stroke-dasharray="3 3"/>
        <polygon points="${areaPath}" fill="url(#sparkGrad)"/>
        <polyline points="${linePoints}" fill="none" stroke="var(--color-accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        ${coords.filter(c => c.y !== null && c.v === maxVal).map(c =>
          `<circle cx="${c.x}" cy="${c.y}" r="3.5" fill="#f0abfc"/>`
        ).join('')}
      `;
      sparkWrap.appendChild(svg);
    } else {
      sparkWrap.innerHTML = '<div class="sparkline-empty">No data yet this month</div>';
    }
  } else {
    sparkWrap.innerHTML = '<div class="sparkline-empty">No data yet this month</div>';
  }

  // Feature 6: PDF export button
  const pdfBtn = document.getElementById('btn-export-pdf');
  if (pdfBtn) {
    pdfBtn.onclick = async () => {
      pdfBtn.disabled = true;
      pdfBtn.textContent = '...';
      const result = await api.exportPdf();
      pdfBtn.disabled = false;
      pdfBtn.textContent = result.success ? '✓ Saved' : '↓ PDF';
      if (result.success) setTimeout(() => { pdfBtn.textContent = '↓ PDF'; }, 2500);
    };
  }

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
  const todayStr = todayIso();
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
  loadDate();
  dateDayEl.classList.add('resetting');
  setTimeout(() => dateDayEl.classList.remove('resetting'), 1300);
});

// ════════════════════════════════════════════════════════
// FEATURE 7 — MILESTONES
// ════════════════════════════════════════════════════════

async function renderMilestones() {
  const milestones = await api.getMilestones();
  milestoneList.innerHTML = '';

  if (!milestones.length) {
    milestoneEmpty.classList.remove('hidden');
    return;
  }
  milestoneEmpty.classList.add('hidden');

  // Sort: incomplete first, then by target date
  const sorted = [...milestones].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (a.targetDate || '').localeCompare(b.targetDate || '');
  });

  sorted.forEach(m => milestoneList.appendChild(createMilestoneCard(m)));
}

function createMilestoneCard(m) {
  const card = document.createElement('div');
  card.className = 'milestone-card' + (m.done ? ' done' : '');
  card.dataset.id = m.id;

  // Header row
  const header = document.createElement('div');
  header.className = 'milestone-card-header';

  const title = document.createElement('span');
  title.className = 'milestone-title';
  title.textContent = m.title;

  const delBtn = document.createElement('button');
  delBtn.className = 'milestone-del-btn';
  delBtn.textContent = '×';
  delBtn.title = 'Delete milestone';
  delBtn.addEventListener('click', async () => {
    card.style.opacity = '0';
    card.style.transform = 'scale(0.95)';
    card.style.transition = 'all 0.2s';
    await new Promise(r => setTimeout(r, 200));
    await api.deleteMilestone(m.id);
    renderMilestones();
  });

  header.appendChild(title);
  header.appendChild(delBtn);

  // Meta row: date + category
  const meta = document.createElement('div');
  meta.className = 'milestone-meta';

  if (m.targetDate) {
    const isOver = !m.done && m.targetDate < new Date().toISOString().slice(0,10);
    const dateBadge = document.createElement('span');
    dateBadge.className = 'milestone-date-badge' + (isOver ? ' overdue' : '');
    const d = new Date(m.targetDate + 'T12:00:00');
    dateBadge.textContent = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    meta.appendChild(dateBadge);
  }

  if (m.category) {
    const cat = getCat(m.category);
    const catBadge = document.createElement('span');
    catBadge.className = 'milestone-cat-badge';
    catBadge.textContent = cat.label;
    catBadge.style.color = cat.color;
    catBadge.style.background = `${cat.color}22`;
    meta.appendChild(catBadge);
  }

  if (m.done) {
    const doneBadge = document.createElement('span');
    doneBadge.className = 'milestone-done-badge';
    doneBadge.textContent = '✓ Complete';
    meta.appendChild(doneBadge);
  }

  // Progress bar
  const progressRow = document.createElement('div');
  progressRow.className = 'milestone-progress-row';

  const track = document.createElement('div');
  track.className = 'milestone-progress-track';
  const fill = document.createElement('div');
  fill.className = 'milestone-progress-fill';
  fill.style.width = `${m.progress}%`;
  track.appendChild(fill);

  const pct = document.createElement('span');
  pct.className = 'milestone-progress-pct';
  pct.textContent = `${m.progress}%`;

  progressRow.appendChild(track);
  progressRow.appendChild(pct);

  // Slider (hidden when done)
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'milestone-progress-slider';
  slider.min = 0; slider.max = 100; slider.value = m.progress;
  slider.style.display = m.done ? 'none' : 'block';

  let sliderTimer;
  slider.addEventListener('input', () => {
    const val = Number(slider.value);
    fill.style.width  = `${val}%`;
    pct.textContent   = `${val}%`;
  });
  slider.addEventListener('change', async () => {
    clearTimeout(sliderTimer);
    sliderTimer = setTimeout(async () => {
      const val = Number(slider.value);
      const updated = await api.updateMilestoneProgress(m.id, val);
      if (val >= 100) {
        // Celebrate!
        card.classList.add('done');
        slider.style.display = 'none';
        const doneBadge = document.createElement('span');
        doneBadge.className = 'milestone-done-badge';
        doneBadge.textContent = '✓ Complete';
        meta.appendChild(doneBadge);
        // Trigger Gojo happy if on today tab
        const rider = document.getElementById('avatar-rider');
        if (rider) {
          rider.dataset.state = 'done';
          document.getElementById('gojo-img').src = 'gojohappy.png';
          setTimeout(() => renderMilestones(), 1500);
        } else {
          setTimeout(() => renderMilestones(), 600);
        }
      }
    }, 400);
  });

  card.appendChild(header);
  card.appendChild(meta);
  card.appendChild(progressRow);
  card.appendChild(slider);
  return card;
}

// Milestone modal
document.getElementById('btn-add-milestone').addEventListener('click', () => {
  msTitleInput.value = '';
  msDateInput.value  = new Date().toISOString().slice(0,10);
  msCatSelect.value  = '';
  msModalBackdrop.classList.remove('hidden');
  msTitleInput.focus();
});

document.getElementById('ms-cancel').addEventListener('click', () => {
  msModalBackdrop.classList.add('hidden');
});

document.getElementById('ms-save').addEventListener('click', async () => {
  const title = msTitleInput.value.trim();
  if (!title) { msTitleInput.focus(); return; }
  await api.addMilestone(title, msDateInput.value, msCatSelect.value || null);
  msModalBackdrop.classList.add('hidden');
  renderMilestones();
});

msTitleInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('ms-save').click();
  if (e.key === 'Escape') msModalBackdrop.classList.add('hidden');
});

// ── Upcoming scheduled tasks panel ────────────────────────────────────────
async function renderUpcoming() {
  await api.promoteScheduledTasks();
  const scheduled = await api.getScheduledTasks();

  if (!scheduled.length) { upcomingPanel.classList.add('hidden'); return; }

  upcomingPanel.classList.remove('hidden');
  upcomingCountBadge.textContent = scheduled.length;

  const groups = {};
  scheduled.forEach(t => {
    if (!groups[t.scheduledDate]) groups[t.scheduledDate] = [];
    groups[t.scheduledDate].push(t);
  });

  upcomingList.innerHTML = '';
  Object.keys(groups).sort().forEach(dateStr => {
    const header = document.createElement('div');
    header.className = 'upcoming-group-header';
    const d = new Date(dateStr + 'T12:00:00');
    header.textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    upcomingList.appendChild(header);

    groups[dateStr].forEach(t => {
      const row = document.createElement('div');
      row.className = 'upcoming-task-row';
      const cat = getCat(t.category);

      const colorBar = document.createElement('div');
      colorBar.className = 'upcoming-task-cat';
      colorBar.style.background = cat.color;

      const txt = document.createElement('span');
      txt.className = 'upcoming-task-text';
      txt.textContent = t.text;

      const delBtn = document.createElement('button');
      delBtn.className = 'upcoming-task-del';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', async () => {
        row.style.opacity = '0'; row.style.transition = 'opacity 0.2s';
        await new Promise(r => setTimeout(r, 200));
        await api.deleteScheduledTask(t.id);
        renderUpcoming();
      });

      row.appendChild(colorBar);
      row.appendChild(txt);
      if (t.dueTime) {
        const timeEl = document.createElement('span');
        timeEl.className = 'upcoming-task-time';
        timeEl.textContent = formatTime12(t.dueTime);
        row.appendChild(timeEl);
      }
      row.appendChild(delBtn);
      upcomingList.appendChild(row);
    });
  });
}

document.getElementById('upcoming-toggle').addEventListener('click', () => {
  upcomingPanel.classList.toggle('open');
});

// Auto-reload tasks when scheduler promotes on a new day
api.onScheduledPromoted(async () => {
  tasks = await api.getTasks();
  renderTaskList();
  renderUpcoming();
});

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  tasks = await api.getTasks();
  renderTaskList();
  checkCarryOver();
  renderUpcoming();
}

init();
