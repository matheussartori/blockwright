// Renderer entry point: mount the React app into #app. (No StrictMode — the
// Three.js Viewer is created once and has no teardown, so double-invoked effects
// would spawn a second canvas.)
import './index.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initTheme } from './state/theme';
import { initLogs } from './state/logs';
import { initI18n } from './state/i18n';

// Capture console output into the Console dock from the first line, then apply
// the saved theme + language before the first paint of the app tree.
initLogs();
initTheme();
initI18n();

createRoot(document.getElementById('app')!).render(<App />);
