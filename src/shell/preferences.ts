// Stored per browser and app origin; unreadable storage means off.
export function savedVim() {
  try {
    return localStorage.getItem('treetutor.vim') === 'on';
  } catch {
    return false;
  }
}

export function savedFocusMode() {
  try {
    return localStorage.getItem('treetutor.focus-mode') === 'on';
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

// Library opens as a shelf unless List was chosen.
export function savedLibraryLayout(): 'shelf' | 'list' {
  try {
    return localStorage.getItem('treetutor.library-layout') === 'list' ? 'list' : 'shelf';
  } catch {
    return 'shelf';
  }
}

export function savePreference(
  key: 'appearance' | 'theme' | 'vim' | 'contents' | 'library-layout' | 'focus-mode',
  value: string,
) {
  try {
    localStorage.setItem(`treetutor.${key}`, value);
  } catch {
    /* Preference stays for this session only. */
  }
}
