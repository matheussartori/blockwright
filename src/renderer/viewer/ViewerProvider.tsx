// Bridges the imperative Three.js `Viewer` into React. The provider owns the
// on-screen instance (the Viewer lives for the app's lifetime — it has no
// teardown) and exposes it through context; a `<Viewport/>` registers the
// container div that the Viewer renders into. Nav-mode changes are forwarded
// into the store so the Controls window can reflect Orbit/Fly.
//
// It also owns a second, OFFSCREEN Viewer used only to screenshot builds that
// are generating in a BACKGROUND tab. Routing those captures through a separate
// headless renderer (see `offscreen` in viewer.ts) means a background tab's AI
// self-review loop never disturbs whatever the user is currently looking at — so
// generations in different tabs can run simultaneously.
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Viewer } from './viewer';
import { store } from '../state/store';

interface ViewerContextValue {
  viewer: Viewer | null;
  /** Headless viewer for background-tab capture (created with the on-screen one). */
  captureViewer: Viewer | null;
  register: (el: HTMLDivElement | null) => void;
}

const ViewerContext = createContext<ViewerContextValue>({
  viewer: null,
  captureViewer: null,
  register: () => {},
});

/** The live on-screen Viewer instance, or null until the viewport has mounted. */
export function useViewer(): Viewer | null {
  return useContext(ViewerContext).viewer;
}

/** The headless capture Viewer, or null until it's been created. */
export function useCaptureViewer(): Viewer | null {
  return useContext(ViewerContext).captureViewer;
}

/** Callback ref that creates the Viewer against the container div (once). */
export function useViewerRegister(): (el: HTMLDivElement | null) => void {
  return useContext(ViewerContext).register;
}

/** Fixed render size for the headless capture viewer (square — capture()
 *  downscales to maxSize anyway; this just needs real pixels so WebGL sizes). */
const CAPTURE_SIZE = 900;

export function ViewerProvider({ children }: { children: ReactNode }) {
  const created = useRef(false);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [captureViewer, setCaptureViewer] = useState<Viewer | null>(null);

  const register = useCallback((el: HTMLDivElement | null) => {
    if (created.current || !el) return;
    created.current = true;
    const instance = new Viewer(el);
    instance.onModeChange = (mode) => store.getState().setNavMode(mode);
    setViewer(instance);

    // Create the headless capture viewer against an off-screen, real-sized div
    // (must have real dimensions — not display:none — or WebGL captures blank).
    const off = document.createElement('div');
    off.style.cssText = `position:fixed;left:-${CAPTURE_SIZE * 2}px;top:0;width:${CAPTURE_SIZE}px;height:${CAPTURE_SIZE}px;pointer-events:none;`;
    document.body.appendChild(off);
    setCaptureViewer(new Viewer(off, true));
  }, []);

  return (
    <ViewerContext.Provider value={{ viewer, captureViewer, register }}>
      {children}
    </ViewerContext.Provider>
  );
}

/** The 3D viewport surface — fills the stage; overlays render on top of it. */
export function Viewport() {
  const register = useViewerRegister();
  return <div className="viewport" ref={register} />;
}
