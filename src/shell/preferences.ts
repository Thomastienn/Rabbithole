// Stored per browser and app origin; unreadable storage means off.
export function savedVim() {
  try {
    return localStorage.getItem('treetutor.vim') === 'on';
  } catch {
    return false;
  }
}

// Contents starts open; only an explicit collapse is remembered.
export function savedContentsOpen() {
  try {
    return localStorage.getItem('treetutor.contents') !== 'collapsed';
  } catch {
    return true;
  }
}

export function savePreference(key: 'appearance' | 'theme' | 'vim' | 'contents', value: string) {
  try {
    localStorage.setItem(`treetutor.${key}`, value);
  } catch {
    /* Preference stays for this session only. */
  }
}
