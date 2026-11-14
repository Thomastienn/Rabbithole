// Stored per browser and app origin; unreadable storage means off.
export function savedVim() {
  try {
    return localStorage.getItem('treetutor.vim') === 'on';
  } catch {
    return false;
  }
}

export function savePreference(key: 'appearance' | 'theme' | 'vim', value: string) {
  try {
    localStorage.setItem(`treetutor.${key}`, value);
  } catch {
    /* Preference stays for this session only. */
  }
}
