const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { TTSBridge } = require('./ttsBridge.cjs');

let studioWindow = null;
let videoWindow = null;
const tts = new TTSBridge();

const isDev = !app.isPackaged;
const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

function getAppUrl(viewName) {
  if (isDev) {
    return `${devUrl}?view=${viewName}`;
  }
  const indexPath = path.join(__dirname, '../dist/index.html');
  return `file://${indexPath}?view=${viewName}`;
}

// 1. Ventana de Estudio y Redacción
function createStudioWindow() {
  studioWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#09090b',
    title: 'Loquendo Reaction Studio - Consola de Control',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });

  const url = getAppUrl('studio');
  if (isDev) {
    studioWindow.loadURL(url);
  } else {
    studioWindow.loadFile(path.join(__dirname, '../dist/index.html'), { query: { view: 'studio' } });
  }

  studioWindow.on('closed', () => {
    studioWindow = null;
    // Si se cierra la consola de estudio principal, cerrar la aplicación completa
    if (videoWindow && !videoWindow.isDestroyed()) {
      videoWindow.close();
    }
  });
}

// 2. Ventana de Video Dedicada (OBS-Clean, con soporte de Pantalla Completa F11)
function createVideoWindow() {
  if (videoWindow && !videoWindow.isDestroyed()) {
    videoWindow.show();
    videoWindow.focus();
    return;
  }

  videoWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 360,
    backgroundColor: '#000000',
    title: 'Loquendo Reaction Studio - Pantalla de Video (F11)',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });

  const url = getAppUrl('video');
  if (isDev) {
    videoWindow.loadURL(url);
  } else {
    videoWindow.loadFile(path.join(__dirname, '../dist/index.html'), { query: { view: 'video' } });
  }

  // Atajo de teclado F11 para conmutar pantalla completa limpia
  videoWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11' && input.type === 'keyDown') {
      const isFull = !videoWindow.isFullScreen();
      videoWindow.setFullScreen(isFull);
      event.preventDefault();
    }
  });

  videoWindow.on('enter-full-screen', () => {
    const notify = (win) => win && !win.isDestroyed() && win.webContents.send('window:fullscreen-change', true);
    notify(videoWindow);
    notify(studioWindow);
  });

  videoWindow.on('leave-full-screen', () => {
    const notify = (win) => win && !win.isDestroyed() && win.webContents.send('window:fullscreen-change', false);
    notify(videoWindow);
    notify(studioWindow);
  });

  videoWindow.on('closed', () => {
    videoWindow = null;
    if (studioWindow && !studioWindow.isDestroyed()) {
      studioWindow.webContents.send('video:status', { isConnected: false });
    }
  });
}

// Reenviar eventos TTS tanto al Estudio como a la Ventana de Video (para los subtítulos)
function setupTTSEvents() {
  const sendToAllWindows = (channel, payload) => {
    if (studioWindow && !studioWindow.isDestroyed()) {
      studioWindow.webContents.send(channel, payload);
    }
    if (videoWindow && !videoWindow.isDestroyed()) {
      videoWindow.webContents.send(channel, payload);
    }
  };

  tts.on('voices', (data) => sendToAllWindows('tts:voices', data));
  tts.on('status', (state) => sendToAllWindows('tts:status', state));
  tts.on('speaking', (info) => sendToAllWindows('tts:speaking', info));
  tts.on('item-finished', (info) => sendToAllWindows('tts:item-finished', info));
  tts.on('queue-empty', () => sendToAllWindows('tts:queue-empty'));
  tts.on('panic', () => sendToAllWindows('tts:panic'));

  // Iniciar puente PowerShell priorizando SysWOW64 (32-bit Loquendo TTS 7)
  tts.init(true);
}

// Controladores IPC para sincronización entre Estudio y Video
function setupIPC() {
  // TTS
  ipcMain.handle('tts:get-state', () => tts.getState());
  ipcMain.handle('tts:enqueue', (_event, payload) => tts.enqueue(payload));
  ipcMain.handle('tts:stop-all', () => {
    tts.stopAll();
    return tts.getState();
  });
  ipcMain.handle('tts:set-config', (_event, config) => tts.setConfig(config));
  ipcMain.handle('tts:refresh-voices', (_event, prefer32Bit = true) => {
    tts.init(prefer32Bit);
    return tts.getState();
  });

  // Comunicación bidireccional entre ventanas
  // Estudio -> Video (Play, Pause, Seek, Load, Volume)
  ipcMain.on('video:action', (_event, action) => {
    if (videoWindow && !videoWindow.isDestroyed()) {
      videoWindow.webContents.send('video:action', action);
    }
  });

  // Video -> Estudio (currentTime, duration, isPlaying)
  ipcMain.on('video:status', (_event, status) => {
    if (studioWindow && !studioWindow.isDestroyed()) {
      studioWindow.webContents.send('video:status', status);
    }
  });

  // Apertura y control de pantalla completa de la ventana de video
  ipcMain.handle('window:open-video', () => {
    createVideoWindow();
    return true;
  });

  ipcMain.handle('window:toggle-video-fullscreen', () => {
    if (videoWindow && !videoWindow.isDestroyed()) {
      const next = !videoWindow.isFullScreen();
      videoWindow.setFullScreen(next);
      return next;
    }
    return false;
  });

  // Diálogo para seleccionar video
  ipcMain.handle('dialog:open-video', async () => {
    const parent = studioWindow || null;
    const result = await dialog.showOpenDialog(parent, {
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

  // Diálogo para exportar subtítulos .SRT
  ipcMain.handle('dialog:save-srt', async (_event, { defaultName, content }) => {
    const parent = studioWindow || null;
    const result = await dialog.showSaveDialog(parent, {
      title: 'Exportar Subtítulos de Reacción (.srt)',
      defaultPath: defaultName || 'reaccion-loquendo.srt',
      filters: [{ name: 'SubRip Subtitles (.srt)', extensions: ['srt'] }]
    });
    if (result.canceled || !result.filePath) return { saved: false };
    fs.writeFileSync(result.filePath, content, 'utf8');
    return { saved: true, filePath: result.filePath };
  });
}

// Inicialización de la aplicación: abre automáticamente ambas ventanas
app.whenReady().then(() => {
  setupIPC();
  createStudioWindow();
  createVideoWindow();
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
