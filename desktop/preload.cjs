// The update banner's bridge to the shell (main.mjs offerUpdates) and the open tree's title for the Discord status;
// a sandboxed preload must be CommonJS.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rabbitholeDesktop', {
    activity: (title) => ipcRenderer.send('activity', title),
    update: (action) => ipcRenderer.invoke('update', action),
    onUpdate: (listener) => {
        const forward = (_event, state) => listener(state);
        ipcRenderer.on('update', forward);
        return () => ipcRenderer.removeListener('update', forward);
    },
});
