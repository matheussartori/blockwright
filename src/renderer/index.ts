// Renderer entry point: mount the UI shell, spin up the 3D viewer, and hand
// both to the App, which owns the load flow and event wiring.
import './index.css';
import { Viewer } from './viewer/viewer';
import { mountShell } from './ui/shell';
import { App } from './app';

const root = document.getElementById('app')!;
const shell = mountShell(root, window.blockwright.platform);
const viewer = new Viewer(shell.viewport);

new App(shell, viewer);
