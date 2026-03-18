const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('todoDoddle', {
  getTasks:               ()              => ipcRenderer.invoke('get-tasks'),
  addTask:                (text, cat)     => ipcRenderer.invoke('add-task', text, cat),
  toggleTask:             (id)            => ipcRenderer.invoke('toggle-task', id),
  deleteTask:             (id)            => ipcRenderer.invoke('delete-task', id),
  reorderTasks:           (ids)           => ipcRenderer.invoke('reorder-tasks', ids),
  updateTask:             (id, text)      => ipcRenderer.invoke('update-task', id, text),
  getYesterdayUnfinished: ()              => ipcRenderer.invoke('get-yesterday-unfinished'),
  listArchiveSummaries:   ()              => ipcRenderer.invoke('list-archive-summaries'),
  getDate:                ()              => ipcRenderer.invoke('get-date'),
  getArchive:             (date)          => ipcRenderer.invoke('get-archive', date),
  listArchiveDates:       ()              => ipcRenderer.invoke('list-archive-dates'),
  getWeekData:            ()              => ipcRenderer.invoke('get-week-data'),
  onDayReset:             (cb)            => ipcRenderer.on('day-reset', cb),
  minimize:               ()              => ipcRenderer.send('window-minimize'),
  close:                  ()              => ipcRenderer.send('window-close')
});
