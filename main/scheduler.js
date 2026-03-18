const { today, getCurrentDate, resetForNewDay } = require('./store');

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
