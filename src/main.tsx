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
import { layoutCss } from './layout';
import flowCss from '@xyflow/react/dist/style.css?inline';
import ChatPage from './ChatPage';
import { savedAppearance, savedTheme, type Appearance, type ThemeChoice } from './appearance';

const styles = document.createElement('style');
styles.textContent = flowCss + layoutCss;
document.head.append(styles);

function App() {
  const [appearance, setAppearance] = useState(savedAppearance);
  // Read before the first render, so the saved theme is the first one painted.
  const [theme, setTheme] = useState<ThemeChoice>(() => {
    try {
      return savedTheme(localStorage.getItem('treetutor.theme'));
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
          try {
            localStorage.setItem('treetutor.appearance', next);
          } catch {
            /* Preference stays for this session only. */
          }
        }}
        theme={theme}
        setTheme={(next) => {
          setTheme(next);
          try {
            localStorage.setItem('treetutor.theme', next);
          } catch {
            /* Preference stays for this session only. */
          }
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
