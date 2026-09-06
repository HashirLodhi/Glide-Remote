const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('glide', {
  getSession: () => ipcRenderer.invoke('get-session'),
  newSession: () => ipcRenderer.invoke('new-session'),
  onStatus: (callback) => { const listener = (_, value) => callback(value); ipcRenderer.on('session-status', listener); return () => ipcRenderer.removeListener('session-status', listener); }
});
