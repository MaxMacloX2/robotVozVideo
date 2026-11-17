const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('loquendoAPI', {
  // Acciones de TTS
  getState: () => ipcRenderer.invoke('tts:get-state'),
  enqueue: (payload) => ipcRenderer.invoke('tts:enqueue', payload),
  stopAll: () => ipcRenderer.invoke('tts:stop-all'),
  setConfig: (config) => ipcRenderer.invoke('tts:set-config', config),
  refreshVoices: (prefer32Bit) => ipcRenderer.invoke('tts:refresh-voices', prefer32Bit),

  // Diálogos de archivos (Video y exportación SRT)
  openVideoDialog: () => ipcRenderer.invoke('dialog:open-video'),
  saveSrtDialog: (data) => ipcRenderer.invoke('dialog:save-srt', data),

  // Suscripción a eventos en tiempo real desde el proceso principal
  onEvent: (channel, callback) => {
    const allowedChannels = [
      'tts:voices',
      'tts:status',
      'tts:speaking',
      'tts:item-finished',
      'tts:queue-empty',
      'tts:panic'
    ];
    if (!allowedChannels.includes(channel)) return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});

