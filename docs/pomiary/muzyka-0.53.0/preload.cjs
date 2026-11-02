const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('musicQA', { report: data => ipcRenderer.invoke('music-report', data) });
