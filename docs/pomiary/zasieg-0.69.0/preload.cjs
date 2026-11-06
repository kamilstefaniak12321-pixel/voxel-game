const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('distanceProof', {
    config: () => ipcRenderer.invoke('distance-config'),
    report: (name, report) => ipcRenderer.invoke('distance-report', { name, report }),
    photo: name => ipcRenderer.invoke('distance-photo', { name }),
    onToggle: callback => ipcRenderer.on('distance-toggle', () => callback())
});
