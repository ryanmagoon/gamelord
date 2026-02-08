import { app, BrowserWindow, net, protocol } from 'electron';
import path from 'node:path';
import { IPCHandlers } from './main/ipc/handlers';

// Set app name for macOS menu bar (must be called before app is ready)
app.setName('GameLord');

// Initialize IPC handlers
let ipcHandlers: IPCHandlers;

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    },
  });

  // and load the index.html of the app.
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  // Register artwork:// protocol to serve cached cover art images
  // from the sandboxed renderer via <img src="artwork://gameId.png">
  protocol.handle('artwork', (request) => {
    const filename = request.url.slice('artwork://'.length);
    const filePath = path.join(app.getPath('userData'), 'artwork', filename);
    return net.fetch(`file://${filePath}`);
  });

  // Initialize IPC handlers before creating window
  const preloadPath = path.join(__dirname, '../preload/index.js');
  ipcHandlers = new IPCHandlers(preloadPath);
  createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
