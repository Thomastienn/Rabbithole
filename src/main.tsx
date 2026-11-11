import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@fontsource/public-sans/400.css';
import '@fontsource/public-sans/500.css';
import '@fontsource/public-sans/600.css';
import '@fontsource/public-sans/700.css';
import '@fontsource/source-serif-4/400.css';
import '@fontsource/source-serif-4/400-italic.css';
import '@fontsource/source-serif-4/600.css';
import { Theme } from '@astryxdesign/core/theme';
import { themes, defaultThemeSlug } from './astryx-themes';
import { layoutCss } from './layout';
import flowCss from '@xyflow/react/dist/style.css?inline';
import ChatPage from './ChatPage';
import { savedAppearance, type Appearance } from './appearance';

const styles = document.createElement('style');
styles.textContent = flowCss + layoutCss;
document.head.append(styles);

function App() {
  const [appearance, setAppearance] = useState(savedAppearance);
  return <Theme theme={themes[defaultThemeSlug]} mode={appearance}>
    <ChatPage appearance={appearance} setAppearance={next => { setAppearance(next); try { localStorage.setItem('treetutor.appearance', next); } catch { /* Preference stays for this session only. */ } }} />
  </Theme>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
