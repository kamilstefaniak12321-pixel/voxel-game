const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lightingQA', {
    config: () => ipcRenderer.invoke('lighting-config'),
    report: (name, report) => ipcRenderer.invoke('lighting-report', { name, report }),
    photo: (name, report) => ipcRenderer.invoke('lighting-photo', { name, report }),
    onTogglePanel: callback => ipcRenderer.on('lighting-toggle-panel', () => callback())
});
