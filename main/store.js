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
        createdAt: { type: 'string' }
      }
    }
  }
};

const store = new Store({ schema });

function today() {
  return new Date().toISOString().slice(0, 10);
}

function getTasks() {
  return store.get('tasks');
}

function addTask(text, category) {
  const tasks = getTasks();
  const task = {
    id: String(Date.now()),
    text: text.trim(),
    done: false,
    category: category || 'other',
    createdAt: new Date().toISOString()
  };
  tasks.push(task);
  store.set('tasks', tasks);
  return task;
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
  archiveCurrentDay();
  store.set('tasks', []);
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
    const dateStr = day.toISOString().slice(0, 10);
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

function getYesterdayUnfinished() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterdayStr = d.toISOString().slice(0, 10);
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

module.exports = {
  store,
  today,
  getTasks,
  addTask,
  toggleTask,
  deleteTask,
  deleteArchivedTask,
  prioritizeTask,
  reorderTasks,
  updateTask,
  getYesterdayUnfinished,
  listArchiveSummaries,
  resetForNewDay,
  getCurrentDate,
  setCurrentDate,
  getArchive,
  listArchiveDates,
  getWeekData,
  getMonthData
};
