const Store = require('electron-store');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const schema = {
  currentDate: { type: 'string', default: '' },
  tasks: {
    type: 'array',
    default: [],
    items: {
      type: 'object',
      properties: {
        id:        { type: 'string' },
        text:      { type: 'string' },
        done:      { type: 'boolean' },
        priority:  { type: 'boolean' },
        category:  { type: 'string' },
        dueTime:   { type: 'string' },   /* "HH:MM" or '' */
        notes:     { type: 'string' },   /* short note line */
        createdAt: { type: 'string' }
      }
    }
  },
  milestones: {
    type: 'array',
    default: [],
    items: { type: 'object' }
  },
  scheduledTasks: {
    type: 'array',
    default: [],
    items: { type: 'object' }
  }
};

const store = new Store({ schema });

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayEST() {
  // Convert current time to EST and return YYYY-MM-DD in EST
  const estTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return localDate(estTime);
}

function today() {
  return todayEST();
}

function getTasks() {
  return store.get('tasks');
}

function addTask(text, category, dueTime) {
  const tasks = getTasks();
  const task = {
    id:        String(Date.now()),
    text:      text.trim(),
    done:      false,
    category:  category || 'other',
    dueTime:   dueTime  || '',
    notes:     '',
    createdAt: new Date().toISOString()
  };
  tasks.push(task);
  store.set('tasks', tasks);
  return task;
}

function updateNotes(id, notes) {
  const tasks = getTasks().map(t => t.id === id ? { ...t, notes: (notes || '').trim() } : t);
  store.set('tasks', tasks);
  return tasks;
}

function toggleTask(id) {
  const tasks = getTasks().map(t => t.id === id ? { ...t, done: !t.done } : t);
  store.set('tasks', tasks);
  return tasks;
}

function deleteTask(id) {
  const tasks = getTasks().filter(t => t.id !== id);
  store.set('tasks', tasks);
  return tasks;
}

function archiveCurrentDay() {
  const currentDate = store.get('currentDate');
  if (!currentDate) return;

  const tasks = getTasks();
  const archiveDir = path.join(app.getPath('userData'), 'archive');
  fs.mkdirSync(archiveDir, { recursive: true });

  const archiveFile = path.join(archiveDir, `${currentDate}.json`);
  const total = tasks.length;
  const completed = tasks.filter(t => t.done).length;

  fs.writeFileSync(archiveFile, JSON.stringify({
    date: currentDate,
    archivedAt: new Date().toISOString(),
    tasks,
    summary: { total, completed }
  }, null, 2));
}

function resetForNewDay() {
  // Archive all tasks from yesterday (completed and pending)
  archiveCurrentDay();

  // Move pending tasks to today, keep completed in archive
  const currentTasks = getTasks();
  const pendingTasks = currentTasks.filter(t => !t.done);

  store.set('tasks', pendingTasks);
  store.set('currentDate', today());
}

function getCurrentDate() {
  return store.get('currentDate');
}

function setCurrentDate(date) {
  store.set('currentDate', date);
}

function getArchiveDir() {
  return path.join(app.getPath('userData'), 'archive');
}

function getArchive(date) {
  const archiveFile = path.join(getArchiveDir(), `${date}.json`);
  try {
    const data = fs.readFileSync(archiveFile, 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function listArchiveDates() {
  const archiveDir = getArchiveDir();
  try {
    fs.mkdirSync(archiveDir, { recursive: true });
    return fs.readdirSync(archiveDir)
      .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map(f => f.replace('.json', ''))
      .sort();
  } catch {
    return [];
  }
}

function getWeekData(offsetWeeks = 0) {
  const d = new Date();
  const dow = d.getDay(); // 0=Sun
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset + offsetWeeks * 7);
  monday.setHours(0, 0, 0, 0);
  const todayStr = today();

  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    const dateStr = localDate(day);
    let dayTasks = [];
    if (dateStr === todayStr) {
      dayTasks = getTasks();
    } else if (dateStr < todayStr) {
      const archive = getArchive(dateStr);
      dayTasks = archive ? archive.tasks : [];
    }
    return {
      date: dateStr,
      dayName: day.toLocaleString('en-US', { weekday: 'short' }).toUpperCase(),
      tasks: dayTasks
    };
  });
}

function getMonthData(year, month) {
  const todayStr = today();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (dateStr > todayStr) break;
    let dayTasks = dateStr === todayStr ? getTasks() : (getArchive(dateStr)?.tasks || []);
    days.push({ date: dateStr, tasks: dayTasks });
  }

  // KPI calculations
  const allTasks   = days.flatMap(d => d.tasks);
  const total      = allTasks.length;
  const completed  = allTasks.filter(t => t.done).length;
  const rate       = total === 0 ? 0 : Math.round((completed / total) * 100);
  const activeDays = days.filter(d => d.tasks.length > 0);
  const perfectDays = days.filter(d => d.tasks.length > 0 && d.tasks.every(t => t.done)).length;
  const avgPerDay  = activeDays.length === 0 ? 0 : +(total / activeDays.length).toFixed(1);

  // Longest streak of consecutive days with at least one task
  let streak = 0, maxStreak = 0, cur = 0;
  days.forEach(d => {
    if (d.tasks.length > 0) { cur++; maxStreak = Math.max(maxStreak, cur); }
    else cur = 0;
  });

  // Top category
  const catCounts = {};
  allTasks.forEach(t => { const c = t.category || 'other'; catCounts[c] = (catCounts[c] || 0) + 1; });
  const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];

  // Best day (most completed)
  let bestDay = null, bestCount = 0;
  days.forEach(d => {
    const done = d.tasks.filter(t => t.done).length;
    if (done > bestCount) { bestCount = done; bestDay = d.date; }
  });

  // Weekly breakdown (group into Mon-Sun chunks)
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    const wTotal = chunk.flatMap(d => d.tasks).length;
    const wDone  = chunk.flatMap(d => d.tasks).filter(t => t.done).length;
    weeks.push({ total: wTotal, done: wDone, rate: wTotal === 0 ? 0 : Math.round((wDone / wTotal) * 100) });
  }

  return {
    days,
    kpis: { total, completed, rate, perfectDays, avgPerDay, maxStreak, topCategory: topCat ? topCat[0] : null, bestDay, weeks }
  };
}

function reorderTasks(orderedIds) {
  const tasks = getTasks();
  const map = Object.fromEntries(tasks.map(t => [t.id, t]));
  const reordered = orderedIds.map(id => map[id]).filter(Boolean);
  store.set('tasks', reordered);
  return reordered;
}

function prioritizeTask(id) {
  const tasks = getTasks().map(t => t.id === id ? { ...t, priority: !t.priority } : t);
  store.set('tasks', tasks);
  return tasks;
}

function updateTask(id, newText) {
  const text = (newText || '').trim();
  if (!text) return getTasks();
  const tasks = getTasks().map(t => t.id === id ? { ...t, text } : t);
  store.set('tasks', tasks);
  return tasks;
}

function deleteArchivedTask(date, taskId) {
  const archiveFile = path.join(getArchiveDir(), `${date}.json`);
  try {
    const data = JSON.parse(fs.readFileSync(archiveFile, 'utf8'));
    data.tasks = data.tasks.filter(t => t.id !== taskId);
    data.summary = {
      total:     data.tasks.length,
      completed: data.tasks.filter(t => t.done).length
    };
    fs.writeFileSync(archiveFile, JSON.stringify(data, null, 2));
    return data.tasks;
  } catch {
    return [];
  }
}

function moveCompletedTasksToYesterday() {
  // Move all completed tasks from today to yesterday's archive
  const currentTasks = getTasks();
  const completedTasks = currentTasks.filter(t => t.done);
  const pendingTasks = currentTasks.filter(t => !t.done);

  if (completedTasks.length === 0) return 0;

  // Get yesterday's date and archive
  const estDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  estDate.setDate(estDate.getDate() - 1);
  const yesterdayStr = localDate(estDate);

  const archiveDir = getArchiveDir();
  fs.mkdirSync(archiveDir, { recursive: true });
  const archiveFile = path.join(archiveDir, `${yesterdayStr}.json`);

  // Load yesterday's archive if it exists
  let yesterdayData = { date: yesterdayStr, archivedAt: new Date().toISOString(), tasks: [], summary: { total: 0, completed: 0 } };
  try {
    const existing = fs.readFileSync(archiveFile, 'utf8');
    yesterdayData = JSON.parse(existing);
  } catch {
    // File doesn't exist, we'll create it
  }

  // Merge completed tasks into yesterday's archive
  yesterdayData.tasks.push(...completedTasks);
  yesterdayData.summary = {
    total: yesterdayData.tasks.length,
    completed: yesterdayData.tasks.filter(t => t.done).length
  };
  fs.writeFileSync(archiveFile, JSON.stringify(yesterdayData, null, 2));

  // Keep only pending tasks in today's list
  store.set('tasks', pendingTasks);

  return completedTasks.length;
}

function getYesterdayUnfinished() {
  const estDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  estDate.setDate(estDate.getDate() - 1);
  const yesterdayStr = localDate(estDate);
  const archive = getArchive(yesterdayStr);
  if (!archive) return [];
  return archive.tasks.filter(t => !t.done);
}

function listArchiveSummaries() {
  return listArchiveDates().map(date => {
    const archive = getArchive(date);
    if (!archive) return { date, total: 0, completed: 0, topCategory: null };
    const catCounts = {};
    (archive.tasks || []).forEach(t => {
      const c = t.category || 'other';
      catCounts[c] = (catCounts[c] || 0) + 1;
    });
    const top = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];
    return {
      date,
      total:       archive.summary.total,
      completed:   archive.summary.completed,
      topCategory: top ? top[0] : null
    };
  });
}

// ── Scheduled Tasks ────────────────────────────────────────────────────────
function getScheduledTasks() {
  return store.get('scheduledTasks') || [];
}

function addScheduledTask(text, category, dueTime, scheduledDate) {
  const scheduled = getScheduledTasks();
  const task = {
    id:            String(Date.now()),
    text:          (text || '').trim(),
    category:      category || 'other',
    dueTime:       dueTime  || '',
    notes:         '',
    scheduledDate: scheduledDate,
    createdAt:     new Date().toISOString()
  };
  scheduled.push(task);
  store.set('scheduledTasks', scheduled);
  return task;
}

function deleteScheduledTask(id) {
  const scheduled = getScheduledTasks().filter(t => t.id !== id);
  store.set('scheduledTasks', scheduled);
  return scheduled;
}

/** Moves any scheduled tasks with scheduledDate <= today into active tasks.
 *  Returns the number of tasks promoted. */
function promoteScheduledTasks() {
  const todayStr = today();
  const scheduled = getScheduledTasks();
  const due  = scheduled.filter(t => t.scheduledDate <= todayStr);
  const rest = scheduled.filter(t => t.scheduledDate >  todayStr);

  if (!due.length) return 0;

  const active = getTasks();
  due.forEach(t => {
    active.push({
      id:        t.id,
      text:      t.text,
      done:      false,
      priority:  false,
      category:  t.category,
      dueTime:   t.dueTime,
      notes:     t.notes || '',
      createdAt: t.createdAt
    });
  });
  store.set('tasks', active);
  store.set('scheduledTasks', rest);
  return due.length;
}

// ── Milestones ─────────────────────────────────────────────────────────────
function getMilestones() {
  return store.get('milestones') || [];
}

function addMilestone(title, targetDate, category) {
  const ms = getMilestones();
  const m = {
    id:         String(Date.now()),
    title:      (title || '').trim(),
    targetDate: targetDate || '',
    category:   category   || null,
    notes:      '',
    progress:   0,
    done:       false,
    createdAt:  new Date().toISOString()
  };
  ms.push(m);
  store.set('milestones', ms);
  return ms;
}

function updateMilestoneProgress(id, progress) {
  const val = Math.min(100, Math.max(0, Number(progress) || 0));
  const ms = getMilestones().map(m =>
    m.id === id ? { ...m, progress: val, done: val >= 100 } : m
  );
  store.set('milestones', ms);
  return ms;
}

function deleteMilestone(id) {
  const ms = getMilestones().filter(m => m.id !== id);
  store.set('milestones', ms);
  return ms;
}

module.exports = {
  store,
  today,
  getTasks,
  addTask,
  getScheduledTasks,
  addScheduledTask,
  deleteScheduledTask,
  promoteScheduledTasks,
  toggleTask,
  deleteTask,
  deleteArchivedTask,
  prioritizeTask,
  reorderTasks,
  updateTask,
  updateNotes,
  moveCompletedTasksToYesterday,
  getYesterdayUnfinished,
  listArchiveSummaries,
  resetForNewDay,
  getCurrentDate,
  setCurrentDate,
  getArchive,
  listArchiveDates,
  getWeekData,
  getMonthData,
  getMilestones,
  addMilestone,
  updateMilestoneProgress,
  deleteMilestone
};
