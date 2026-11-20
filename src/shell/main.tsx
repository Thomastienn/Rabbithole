import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-semi-condensed/500.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/700.css';
import '@fontsource/atkinson-hyperlegible-next/400.css';
import '@fontsource/atkinson-hyperlegible-next/400-italic.css';
import '@fontsource/atkinson-hyperlegible-next/600.css';
import { Theme } from '@astryxdesign/core/theme';
import { defaultThemeSlug, themes } from './astryx-themes';
import ChatPage from './ChatPage';
import {
  applyFont,
  savedAppearance,
  savedFont,
  savedTheme,
  type Appearance,
  type ThemeChoice,
} from './appearance';
import { savePreference } from './preferences';
// Last, so the map and app styles follow every other stylesheet, in this order.
import '@xyflow/react/dist/style.css';
import '../styles/shell.css';
import '../styles/library.css';
import '../styles/knowledge.css';
import '../styles/workspace.css';
import '../styles/reading.css';
import '../styles/attachments.css';
import '../styles/media.css';
import '../styles/export.css';
import '../styles/video-rows.css';
import '../styles/discussion.css';
import '../styles/states.css';
import '../styles/map.css';
import '../styles/settings.css';

applyFont('reading-font', savedFont('reading-font'));
applyFont('interface-font', savedFont('interface-font'));

function App() {
  const [appearance, setAppearance] = useState(savedAppearance);
  // Read before the first render, so the saved theme is the first one painted.
  const [theme, setTheme] = useState<ThemeChoice>(() => {
    try {
      return savedTheme(localStorage.getItem('rabbithole.theme'));
    } catch {
      return defaultThemeSlug;
    }
  });
  return (
    <Theme theme={themes[theme]} mode={appearance}>
      <ChatPage
        appearance={appearance}
        setAppearance={(next) => {
          setAppearance(next);
          savePreference('appearance', next);
        }}
        theme={theme}
        setTheme={(next) => {
          setTheme(next);
          savePreference('theme', next);
        }}
      />
    </Theme>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
