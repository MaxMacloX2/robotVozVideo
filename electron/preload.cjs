const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('loquendoAPI', {
  // Acciones de TTS (SAPI 5 / Loquendo)
  getState: () => ipcRenderer.invoke('tts:get-state'),
  enqueue: (payload) => ipcRenderer.invoke('tts:enqueue', payload),
  stopAll: () => ipcRenderer.invoke('tts:stop-all'),
  setConfig: (config) => ipcRenderer.invoke('tts:set-config', config),
  refreshVoices: (prefer32Bit) => ipcRenderer.invoke('tts:refresh-voices', prefer32Bit),

  // Diálogos de archivos (Video y exportación SRT)
  openVideoDialog: () => ipcRenderer.invoke('dialog:open-video'),
  saveSrtDialog: (data) => ipcRenderer.invoke('dialog:save-srt', data),

  // Control y sincronización Multi-Ventana (Estudio <-> Visor de Video)
  sendVideoAction: (action) => ipcRenderer.send('video:action', action),
  onVideoAction: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('video:action', listener);
    return () => ipcRenderer.removeListener('video:action', listener);
  },
  sendVideoStatus: (status) => ipcRenderer.send('video:status', status),
  onVideoStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('video:status', listener);
    return () => ipcRenderer.removeListener('video:status', listener);
  },
  openVideoWindow: () => ipcRenderer.invoke('window:open-video'),
  toggleVideoFullScreen: () => ipcRenderer.invoke('window:toggle-video-fullscreen'),

  // Suscripción a eventos en tiempo real desde el proceso principal
  onEvent: (channel, callback) => {
    const allowedChannels = [
      'tts:voices',
      'tts:status',
      'tts:speaking',
      'tts:item-finished',
      'tts:queue-empty',
      'tts:panic',
      'window:fullscreen-change'
    ];
    if (!allowedChannels.includes(channel)) return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});
