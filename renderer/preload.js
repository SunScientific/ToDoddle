const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('todoDoddle', {
  getTasks:               ()              => ipcRenderer.invoke('get-tasks'),
  addTask:                (text, cat)     => ipcRenderer.invoke('add-task', text, cat),
  toggleTask:             (id)            => ipcRenderer.invoke('toggle-task', id),
  deleteTask:             (id)            => ipcRenderer.invoke('delete-task', id),
  deleteArchivedTask:     (date, id)      => ipcRenderer.invoke('delete-archived-task', date, id),
  prioritizeTask:         (id)            => ipcRenderer.invoke('prioritize-task', id),
  reorderTasks:           (ids)           => ipcRenderer.invoke('reorder-tasks', ids),
  updateTask:             (id, text)      => ipcRenderer.invoke('update-task', id, text),
  getYesterdayUnfinished: ()              => ipcRenderer.invoke('get-yesterday-unfinished'),
  listArchiveSummaries:   ()              => ipcRenderer.invoke('list-archive-summaries'),
  getDate:                ()              => ipcRenderer.invoke('get-date'),
  getArchive:             (date)          => ipcRenderer.invoke('get-archive', date),
  listArchiveDates:       ()              => ipcRenderer.invoke('list-archive-dates'),
  getWeekData:            (offset)        => ipcRenderer.invoke('get-week-data', offset),
  getMonthData:           (year, month)   => ipcRenderer.invoke('get-month-data', year, month),
  onDayReset:             (cb)            => ipcRenderer.on('day-reset', cb),
  minimize:               ()              => ipcRenderer.send('window-minimize'),
  close:                  ()              => ipcRenderer.send('window-close')
});
