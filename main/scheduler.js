const { today, getCurrentDate, resetForNewDay, promoteScheduledTasks } = require('./store');

let intervalId = null;

function checkAndReset(mainWindow) {
  const storedDate = getCurrentDate();
  const currentDate = today();

  if (storedDate !== currentDate) {
    resetForNewDay();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('day-reset');
    }
  }
  // Promote any scheduled tasks that are now due (runs on every check)
  const promoted = promoteScheduledTasks();
  if (promoted > 0 && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('scheduled-tasks-promoted', promoted);
  }
}

function startMidnightWatch(mainWindow) {
  // Check immediately on startup
  checkAndReset(mainWindow);

  // Then check every 60 seconds
  intervalId = setInterval(() => {
    checkAndReset(mainWindow);
  }, 60 * 1000);
}

function stopMidnightWatch() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = { startMidnightWatch, stopMidnightWatch };
