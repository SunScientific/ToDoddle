const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('todoDoddle', {
  getTasks:                 ()                      => ipcRenderer.invoke('get-tasks'),
  addTask:                  (text, cat, dueTime)    => ipcRenderer.invoke('add-task', text, cat, dueTime),
  toggleTask:               (id)                   => ipcRenderer.invoke('toggle-task', id),
  deleteTask:               (id)                   => ipcRenderer.invoke('delete-task', id),
  deleteArchivedTask:       (date, id)              => ipcRenderer.invoke('delete-archived-task', date, id),
  prioritizeTask:           (id)                   => ipcRenderer.invoke('prioritize-task', id),
  reorderTasks:             (ids)                  => ipcRenderer.invoke('reorder-tasks', ids),
  updateTask:               (id, text)             => ipcRenderer.invoke('update-task', id, text),
  updateNotes:              (id, notes)             => ipcRenderer.invoke('update-notes', id, notes),
  getYesterdayUnfinished:   ()                     => ipcRenderer.invoke('get-yesterday-unfinished'),
  listArchiveSummaries:     ()                     => ipcRenderer.invoke('list-archive-summaries'),
  getDate:                  ()                     => ipcRenderer.invoke('get-date'),
  getArchive:               (date)                 => ipcRenderer.invoke('get-archive', date),
  listArchiveDates:         ()                     => ipcRenderer.invoke('list-archive-dates'),
  getWeekData:              (offset)               => ipcRenderer.invoke('get-week-data', offset),
  getMonthData:             (year, month)          => ipcRenderer.invoke('get-month-data', year, month),
  getMilestones:            ()                     => ipcRenderer.invoke('get-milestones'),
  addMilestone:             (title, date, cat)     => ipcRenderer.invoke('add-milestone', title, date, cat),
  updateMilestoneProgress:  (id, progress)         => ipcRenderer.invoke('update-milestone-progress', id, progress),
  deleteMilestone:          (id)                   => ipcRenderer.invoke('delete-milestone', id),
  exportPdf:                ()                     => ipcRenderer.invoke('export-pdf'),
  onDayReset:               (cb)                  => ipcRenderer.on('day-reset', cb),
  minimize:                 ()                     => ipcRenderer.send('window-minimize'),
  close:                    ()                     => ipcRenderer.send('window-close')
});
