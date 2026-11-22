// The update banner's bridge to the shell (main.mjs offerUpdates); a sandboxed preload must be CommonJS.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rabbitholeDesktop', {
    update: (action) => ipcRenderer.invoke('update', action),
    onUpdate: (listener) => {
        const forward = (_event, state) => listener(state);
        ipcRenderer.on('update', forward);
        return () => ipcRenderer.removeListener('update', forward);
    },
});
