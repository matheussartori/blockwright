// GPU / software-GL fallback. Blockwright is a 3D (WebGL/Three.js) app, so the renderer
// needs a working GL context. On GPU-less hosts — VMs, some headless / flatpak / Wayland
// setups — Chromium's GPU process fails to initialize ("OpenGL ES 2.0 is not supportable"),
// crash-loops, and the window renders ALL WHITE. This module keeps hardware acceleration
// for machines that have a GPU, but:
//   1. always lets WebGL fall back to SwiftShader (software) when no GPU is usable —
//      Chromium blocks software WebGL unless this switch is set, so without it the viewer
//      would stay blank even after the GPU process gives up; and
//   2. if the GPU process still dies, relaunches the app ONCE in full software-GL mode so
//      the UI + viewer render. A re-exec argv flag guards against a relaunch loop.
// Force software mode explicitly with BW_SOFTWARE_GL=1 (or the --bw-software-gl flag) —
// handy for VM users who already know they have no GPU.
import { app } from 'electron';

const SOFTWARE_GL_FLAG = '--bw-software-gl';

/** Switch Chromium to ANGLE+SwiftShader (CPU rendering) and drop GPU compositing, so
 *  both the UI and the WebGL viewer render without any hardware GL driver. */
function forceSoftwareGl(): void {
  app.commandLine.appendSwitch('use-gl', 'angle');
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
  app.disableHardwareAcceleration();
}

/** Configure GL fallbacks. Call BEFORE `app` is ready — command-line switches and
 *  `disableHardwareAcceleration` only take effect before the GPU process starts. */
export function configureGpuFallback(): void {
  // Allow WebGL to use SwiftShader when the GPU is unusable (no effect when a GPU works).
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');

  if (process.env.BW_SOFTWARE_GL === '1' || process.argv.includes(SOFTWARE_GL_FLAG)) {
    forceSoftwareGl();
    return; // already in software mode — nothing left to recover from
  }

  // Auto-recover: if the GPU process can't initialize (not a clean exit), relaunch once
  // in software mode so a GPU-less machine still renders instead of showing a white window.
  let recovering = false;
  app.on('child-process-gone', (_event, details) => {
    if (details.type !== 'GPU' || details.reason === 'clean-exit' || recovering) return;
    recovering = true;
    app.relaunch({ args: process.argv.slice(1).concat(SOFTWARE_GL_FLAG) });
    app.exit(0);
  });
}
