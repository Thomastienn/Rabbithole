import React from 'react';
import { createRoot } from 'react-dom/client';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import { Theme } from '@astryxdesign/core/theme';
import { themes, defaultThemeSlug } from './astryx-themes';
import { layoutCss } from './layout';
import ChatPage from './ChatPage';

const styles = document.createElement('style');
styles.textContent = layoutCss;
document.head.append(styles);

createRoot(document.getElementById('root')!).render(<React.StrictMode><Theme theme={themes[defaultThemeSlug]}><ChatPage /></Theme></React.StrictMode>);
