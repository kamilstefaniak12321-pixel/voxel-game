const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('performanceQA', {
    config: () => ipcRenderer.invoke('performance-config'),
    report: (name, report) => ipcRenderer.invoke('performance-report', { name, report }),
    photo: (name, report) => ipcRenderer.invoke('performance-photo', { name, report }),
    onTogglePanel: callback => ipcRenderer.on('performance-toggle-panel', () => callback())
});
