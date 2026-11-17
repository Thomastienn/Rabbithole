/// <reference types="vite/client" />
// shortcut: three ships no types; the sandbox only re-exports it to visual code. Add @types/three if app code uses it.
declare module 'three';
// shortcut: prismjs ships no types; codeTokens.ts types the few parts it uses. Add @types/prismjs if more code uses it.
declare module 'prismjs';
declare module 'prismjs/components.js';
