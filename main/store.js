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

function getWeekData() {
  const d = new Date();
  const dow = d.getDay(); // 0=Sun
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
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

function reorderTasks(orderedIds) {
  const tasks = getTasks();
  const map = Object.fromEntries(tasks.map(t => [t.id, t]));
  const reordered = orderedIds.map(id => map[id]).filter(Boolean);
  store.set('tasks', reordered);
  return reordered;
}

function updateTask(id, newText) {
  const text = (newText || '').trim();
  if (!text) return getTasks();
  const tasks = getTasks().map(t => t.id === id ? { ...t, text } : t);
  store.set('tasks', tasks);
  return tasks;
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
    return {
      date,
      total:     archive ? archive.summary.total     : 0,
      completed: archive ? archive.summary.completed : 0
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
  reorderTasks,
  updateTask,
  getYesterdayUnfinished,
  listArchiveSummaries,
  resetForNewDay,
  getCurrentDate,
  setCurrentDate,
  getArchive,
  listArchiveDates,
  getWeekData
};
