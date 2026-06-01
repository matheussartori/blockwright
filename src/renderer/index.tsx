// Renderer entry point: mount the React app into #app. (No StrictMode — the
// Three.js Viewer is created once and has no teardown, so double-invoked effects
// would spawn a second canvas.)
import './index.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('app')!).render(<App />);
