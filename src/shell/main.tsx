import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@fontsource/archivo/400.css';
import '@fontsource/archivo/500.css';
import '@fontsource/archivo/600.css';
import '@fontsource/archivo/700.css';
import '@fontsource/literata/400.css';
import '@fontsource/literata/400-italic.css';
import '@fontsource/literata/600.css';
import { Theme } from '@astryxdesign/core/theme';
import { themes } from './astryx-themes';
import ChatPage from './ChatPage';
import { savedAppearance, savedTheme, type Appearance, type ThemeChoice } from './appearance';
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
import '../styles/states.css';
import '../styles/map.css';
import '../styles/settings.css';

function App() {
  const [appearance, setAppearance] = useState(savedAppearance);
  // Read before the first render, so the saved theme is the first one painted.
  const [theme, setTheme] = useState<ThemeChoice>(() => {
    try {
      return savedTheme(localStorage.getItem('rabbithole.theme'));
    } catch {
      return 'paperback';
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
