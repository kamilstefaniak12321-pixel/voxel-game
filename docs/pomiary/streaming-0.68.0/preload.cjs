const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('streamingProof', {
    config: () => ipcRenderer.invoke('streaming-config'),
    report: (name, report) => ipcRenderer.invoke('streaming-report', { name, report }),
    photo: name => ipcRenderer.invoke('streaming-photo', { name }),
    onToggle: callback => ipcRenderer.on('streaming-toggle', () => callback())
});
