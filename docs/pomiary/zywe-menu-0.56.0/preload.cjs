const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('menuQA', { report: data => ipcRenderer.invoke('menu-report', data) });
