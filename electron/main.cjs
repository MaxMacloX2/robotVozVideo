const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { TTSBridge } = require('./ttsBridge.cjs');

let mainWindow = null;
const tts = new TTSBridge();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#09090b',
    title: 'Loquendo Reaction Studio',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false // Permite reproducir archivos locales de video (file://) sin restricciones CORS en dev
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Reenviar eventos del puente TTS al proceso de renderizado (React)
function setupTTSEvents() {
  const sendToRenderer = (channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  };

  tts.on('voices', (data) => sendToRenderer('tts:voices', data));
  tts.on('status', (state) => sendToRenderer('tts:status', state));
  tts.on('speaking', (info) => sendToRenderer('tts:speaking', info));
  tts.on('item-finished', (info) => sendToRenderer('tts:item-finished', info));
  tts.on('queue-empty', () => sendToRenderer('tts:queue-empty'));
  tts.on('panic', () => sendToRenderer('tts:panic'));

  // Iniciar puente PowerShell priorizando SysWOW64 (32-bit) para detectar Loquendo TTS 7 + SAPI 5
  tts.init(true);
}

// Controladores IPC seguros
function setupIPC() {
  ipcMain.handle('tts:get-state', () => tts.getState());

  ipcMain.handle('tts:enqueue', (_event, payload) => {
    return tts.enqueue(payload);
  });

  ipcMain.handle('tts:stop-all', () => {
    tts.stopAll();
    return tts.getState();
  });

  ipcMain.handle('tts:set-config', (_event, config) => {
    return tts.setConfig(config);
  });

  ipcMain.handle('tts:refresh-voices', (_event, prefer32Bit = true) => {
    tts.init(prefer32Bit);
    return tts.getState();
  });

  // Selector nativo de archivos de video (.mp4, .mkv, .webm)
  ipcMain.handle('dialog:open-video', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Seleccionar Gameplay Pregrabado',
      properties: ['openFile'],
      filters: [
        { name: 'Videos de Gameplay', extensions: ['mp4', 'mkv', 'webm', 'mov', 'avi'] },
        { name: 'Todos los archivos', extensions: ['*'] }
      ]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    return {
      filePath,
      fileName: path.basename(filePath),
      fileUrl: `file://${filePath.replace(/\\/g, '/')}`
    };
  });

  // Guardar archivo de subtítulos .SRT generado durante la sesión
  ipcMain.handle('dialog:save-srt', async (_event, { defaultName, content }) => {
    if (!mainWindow) return { saved: false };
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Exportar Subtítulos de Reacción (.srt)',
      defaultPath: defaultName || 'reaccion-loquendo.srt',
      filters: [{ name: 'SubRip Subtitles (.srt)', extensions: ['srt'] }]
    });
    if (result.canceled || !result.filePath) return { saved: false };
    fs.writeFileSync(result.filePath, content, 'utf8');
    return { saved: true, filePath: result.filePath };
  });
}

app.whenReady().then(() => {
  setupIPC();
  createWindow();
  setupTTSEvents();
});

app.on('window-all-closed', () => {
  tts.dispose();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  tts.dispose();
});

