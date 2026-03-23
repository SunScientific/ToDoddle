const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const {
  getTasks, addTask, toggleTask, deleteTask, deleteArchivedTask, prioritizeTask,
  reorderTasks, updateTask, updateNotes, getYesterdayUnfinished, listArchiveSummaries,
  today, getCurrentDate, setCurrentDate,
  getArchive, listArchiveDates, getWeekData, getMonthData,
  getMilestones, addMilestone, updateMilestoneProgress, deleteMilestone,
  getScheduledTasks, addScheduledTask, deleteScheduledTask, promoteScheduledTasks
} = require('./store');
const { startMidnightWatch, stopMidnightWatch } = require('./scheduler');

let mainWindow;
let tray = null;

// ── Build a 16×16 green PNG icon at runtime (no external image file needed) ──
function buildTrayIcon() {
  const zlib = require('zlib');
  const W = 16, H = 16;
  const rowSize = 1 + W * 3;
  const raw = Buffer.alloc(H * rowSize, 0);
  for (let y = 0; y < H; y++) {
    raw[y * rowSize] = 0; // filter: None
    for (let x = 0; x < W; x++) {
      const cx = x - W / 2 + 0.5, cy = y - H / 2 + 0.5;
      const i = y * rowSize + 1 + x * 3;
      if (Math.sqrt(cx * cx + cy * cy) <= W / 2 - 0.5) {
        raw[i] = 192; raw[i+1] = 38; raw[i+2] = 211; // #c026d3 magenta
      } else {
        raw[i] = 18; raw[i+1] = 8; raw[i+2] = 42; // dark purple bg
      }
    }
  }
  const deflated = zlib.deflateSync(raw);
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c;
  }
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function chunk(type, data) {
    const t = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crcVal = Buffer.alloc(4); crcVal.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crcVal]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflated),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function setupTray() {
  const icon = nativeImage.createFromBuffer(buildTrayIcon());
  tray = new Tray(icon);
  tray.setToolTip('ToDoddle');
  tray.on('click', () => {
    if (mainWindow) { mainWindow.isVisible() ? mainWindow.focus() : mainWindow.show(); }
  });
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open ToDoddle', click: () => mainWindow && mainWindow.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 760,
    minWidth: 400,
    minHeight: 640,
    resizable: true,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#12082a',
    webPreferences: {
      preload: path.join(__dirname, '../renderer/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Hide to tray instead of closing
  mainWindow.on('close', e => {
    if (!app.isQuitting) { e.preventDefault(); mainWindow.hide(); }
    else { mainWindow = null; }
  });
}

// Prevent duplicate instances — bring existing window to front instead
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  if (!getCurrentDate()) setCurrentDate(today());
  createWindow();
  setupTray();
  startMidnightWatch(mainWindow);
});

app.on('window-all-closed', () => {
  // Do not quit — live in system tray
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopMidnightWatch();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

// ── IPC Handlers ──────────────────────────────────────────────────────────
ipcMain.handle('get-tasks', () => getTasks());

ipcMain.handle('add-task', (_, text, category, dueTime) => {
  if (!text || !text.trim()) return null;
  return addTask(text, category, dueTime);
});

ipcMain.handle('toggle-task',     (_, id) => toggleTask(id));
ipcMain.handle('delete-task',     (_, id) => deleteTask(id));
ipcMain.handle('prioritize-task', (_, id) => prioritizeTask(id));

ipcMain.handle('get-date', () => {
  const d = new Date();
  return {
    iso:     `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
    day:     d.getDate(),
    month:   d.toLocaleString('en-US', { month: 'long' }).toUpperCase(),
    weekday: d.toLocaleString('en-US', { weekday: 'short' }).toUpperCase(),
    year:    d.getFullYear()
  };
});

ipcMain.handle('get-archive',        (_, date)           => getArchive(date));
ipcMain.handle('list-archive-dates', ()                  => listArchiveDates());
ipcMain.handle('get-week-data',      (_, offset = 0)     => getWeekData(offset));
ipcMain.handle('get-month-data',     (_, year, month)    => getMonthData(year, month));

ipcMain.handle('delete-archived-task',     (_, date, id)  => deleteArchivedTask(date, id));
ipcMain.handle('reorder-tasks',            (_, ids)       => reorderTasks(ids));
ipcMain.handle('update-task',              (_, id, text)  => updateTask(id, text));
ipcMain.handle('get-yesterday-unfinished', ()             => getYesterdayUnfinished());
ipcMain.handle('list-archive-summaries',   ()             => listArchiveSummaries());

ipcMain.handle('update-notes',               (_, id, notes)            => updateNotes(id, notes));
ipcMain.handle('get-milestones',             ()                         => getMilestones());
ipcMain.handle('add-milestone',              (_, title, date, cat)      => addMilestone(title, date, cat));
ipcMain.handle('update-milestone-progress',  (_, id, progress)          => updateMilestoneProgress(id, progress));
ipcMain.handle('delete-milestone',           (_, id)                    => deleteMilestone(id));

ipcMain.handle('export-pdf', async () => {
  const { dialog } = require('electron');
  const fs = require('fs');
  const d  = new Date();
  const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `ToDoddle-${label.replace(' ', '-')}.pdf`,
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
  });
  if (result.canceled || !result.filePath) return { success: false };
  try {
    const pdfData = await mainWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      marginsType: 1
    });
    fs.writeFileSync(result.filePath, pdfData);
    return { success: true, path: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-scheduled-tasks',    ()                              => getScheduledTasks());
ipcMain.handle('add-scheduled-task',     (_, text, cat, dueTime, date)  => addScheduledTask(text, cat, dueTime, date));
ipcMain.handle('delete-scheduled-task',  (_, id)                        => deleteScheduledTask(id));
ipcMain.handle('promote-scheduled-tasks',()                              => promoteScheduledTasks());

// Window controls
ipcMain.on('window-minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window-close',    () => mainWindow && mainWindow.hide());
