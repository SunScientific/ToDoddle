const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 3457;
const ROOT = path.join(__dirname, 'renderer');

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.ttf':  'font/truetype',
};

// ── Mock data ──────────────────────────────────────────────────────────────
function makeDate(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const MOCK_TASKS = [
  { id: '1', text: 'Review Q1 budget report',        done: true,  category: 'finance',   createdAt: new Date().toISOString() },
  { id: '2', text: 'Send proposal to client',         done: false, category: 'sales',     createdAt: new Date().toISOString() },
  { id: '3', text: 'Check compliance docs',           done: true,  category: 'legal',     createdAt: new Date().toISOString() },
  { id: '4', text: 'Plan social media campaign',      done: false, category: 'marketing', createdAt: new Date().toISOString() },
  { id: '5', text: 'Update expense tracker',          done: false, category: 'finance',   createdAt: new Date().toISOString() },
  { id: '6', text: 'Follow up with leads',            done: true,  category: 'sales',     createdAt: new Date().toISOString() },
];

function makeWeekDay(offsetFromMonday, taskSets) {
  const monday = new Date();
  const dow = monday.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  monday.setDate(monday.getDate() + diff + offsetFromMonday);
  monday.setHours(0, 0, 0, 0);
  const dateStr = monday.toISOString().slice(0, 10);
  const dayName = monday.toLocaleString('en-US', { weekday: 'short' }).toUpperCase();
  const today   = new Date().toISOString().slice(0, 10);
  const tasks   = dateStr > today ? [] : taskSets[offsetFromMonday] || [];
  return { date: dateStr, dayName, tasks };
}

const WEEK_TASK_SETS = [
  [ // Mon
    { id: 'w1', text: 'Budget review', done: true,  category: 'finance' },
    { id: 'w2', text: 'Sales call',    done: true,  category: 'sales'   },
    { id: 'w3', text: 'Legal review',  done: false, category: 'legal'   },
  ],
  [ // Tue
    { id: 'w4', text: 'Ad campaign',   done: true,  category: 'marketing' },
    { id: 'w5', text: 'Follow-up',     done: true,  category: 'sales'     },
    { id: 'w6', text: 'Invoice check', done: true,  category: 'finance'   },
    { id: 'w7', text: 'Contract draft', done: false, category: 'legal'    },
  ],
  [ // Wed (today)
    ...MOCK_TASKS
  ],
  [ // Thu (future - empty)
  ],
  [ // Fri (future - empty)
  ],
  [ // Sat (future - empty)
  ],
  [ // Sun (future - empty)
  ],
];

const STUB_SCRIPT = `
<script>
(function() {
  const TASKS = ${JSON.stringify(MOCK_TASKS)};
  let tasks = [...TASKS];

  const WEEK = ${JSON.stringify(Array.from({ length: 7 }, (_, i) => makeWeekDay(i, WEEK_TASK_SETS)))};

  const ARCHIVE_DATES = [
    "${makeDate(-7)}", "${makeDate(-6)}", "${makeDate(-5)}",
    "${makeDate(-4)}", "${makeDate(-3)}", "${makeDate(-2)}", "${makeDate(-1)}"
  ];

  const ARCHIVE_TASKS = [
    { id: 'a1', text: 'Reviewed contracts', done: true,  category: 'legal',   createdAt: new Date().toISOString() },
    { id: 'a2', text: 'Cold outreach',       done: true,  category: 'sales',   createdAt: new Date().toISOString() },
    { id: 'a3', text: 'Expense report',      done: false, category: 'finance', createdAt: new Date().toISOString() },
  ];

  window.todoDoddle = {
    getTasks:         ()       => Promise.resolve([...tasks]),
    addTask:          (t, cat) => {
      const task = { id: String(Date.now()), text: t, done: false, category: cat || 'other', createdAt: new Date().toISOString() };
      tasks.push(task);
      return Promise.resolve(task);
    },
    toggleTask: (id) => {
      tasks = tasks.map(t => t.id === id ? { ...t, done: !t.done } : t);
      return Promise.resolve([...tasks]);
    },
    deleteTask: (id) => {
      tasks = tasks.filter(t => t.id !== id);
      return Promise.resolve([...tasks]);
    },
    getDate: () => {
      const d = new Date();
      return Promise.resolve({
        iso:     d.toISOString().slice(0,10),
        day:     d.getDate(),
        month:   d.toLocaleString('en-US',{month:'long'}).toUpperCase(),
        weekday: d.toLocaleString('en-US',{weekday:'short'}).toUpperCase(),
        year:    d.getFullYear()
      });
    },
    reorderTasks: (ids) => {
      const map = Object.fromEntries(tasks.map(t => [t.id, t]));
      tasks = ids.map(id => map[id]).filter(Boolean);
      return Promise.resolve([...tasks]);
    },
    updateTask: (id, text) => {
      tasks = tasks.map(t => t.id === id ? { ...t, text } : t);
      return Promise.resolve([...tasks]);
    },
    getYesterdayUnfinished: () => Promise.resolve([
      { id: 'y1', text: 'Follow up with finance team', done: false, category: 'finance', createdAt: new Date().toISOString() },
      { id: 'y2', text: 'Review legal draft',           done: false, category: 'legal',   createdAt: new Date().toISOString() },
    ]),
    listArchiveSummaries: () => Promise.resolve(
      ARCHIVE_DATES.map((date, i) => ({ date, total: 4 + i % 3, completed: 2 + i % 3 }))
    ),
    getArchive:       (date)  => Promise.resolve({ date, tasks: ARCHIVE_TASKS, summary: { total: 3, completed: 2 } }),
    listArchiveDates: ()      => Promise.resolve(ARCHIVE_DATES),
    getWeekData:      ()      => Promise.resolve(WEEK),
    onDayReset:       (cb)    => {},
    minimize:         ()      => {},
    close:            ()      => {}
  };
})();
</script>
`;

http.createServer((req, res) => {
  let urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const filePath = path.join(ROOT, urlPath);

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext  = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    if (ext === '.html') {
      res.end(data.toString().replace('</head>', STUB_SCRIPT + '</head>'));
    } else {
      res.end(data);
    }
  });
}).listen(PORT, () => console.log(`Preview server running at http://localhost:${PORT}`));
