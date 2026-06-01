// Bridges the imperative Three.js `Viewer` into React. The provider owns one
// instance (the Viewer lives for the app's lifetime — it has no teardown) and
// exposes it through context; a `<Viewport/>` registers the container div that
// the Viewer renders into. Nav-mode changes are forwarded into the store so the
// Controls window can reflect Orbit/Fly.
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
  register: (el: HTMLDivElement | null) => void;
}

const ViewerContext = createContext<ViewerContextValue>({ viewer: null, register: () => {} });

/** The live Viewer instance, or null until the viewport has mounted. */
export function useViewer(): Viewer | null {
  return useContext(ViewerContext).viewer;
}

/** Callback ref that creates the Viewer against the container div (once). */
export function useViewerRegister(): (el: HTMLDivElement | null) => void {
  return useContext(ViewerContext).register;
}

export function ViewerProvider({ children }: { children: ReactNode }) {
  const created = useRef(false);
  const [viewer, setViewer] = useState<Viewer | null>(null);

  const register = useCallback((el: HTMLDivElement | null) => {
    if (created.current || !el) return;
    created.current = true;
    const instance = new Viewer(el);
    instance.onModeChange = (mode) => store.getState().setNavMode(mode);
    setViewer(instance);
  }, []);

  return (
    <ViewerContext.Provider value={{ viewer, register }}>{children}</ViewerContext.Provider>
  );
}

/** The 3D viewport surface — fills the stage; overlays render on top of it. */
export function Viewport() {
  const register = useViewerRegister();
  return <div className="viewport" ref={register} />;
}
