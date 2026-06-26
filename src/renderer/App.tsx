// Renderer orchestration: layout (titlebar / tabs / stage / statusbar) + composition
// of the focused concerns, which live in `app/` hooks: the document open/load/close
// flow (useDocumentFlow), the native-menu/file IPC wiring (useAppIpc), the AI
// self-review render bridge (useAiRenderBridge), and the store→viewer effects
// (useViewerSync). Each open `.nbt` is a tab (a Document) with its own structure,
// chat and AI session; the on-screen viewer follows the active tab, while a headless
// capture viewer screenshots builds generating in background tabs.
import { useEffect, useRef } from 'react';
import { api } from './api';
import { store } from './state/store';
import { plannerStore } from './state/planner';
import { ViewerProvider, Viewport, useViewer, useCaptureViewer } from './viewer/ViewerProvider';
import { useActiveDoc } from './hooks/useStores';
import { useDocumentFlow } from './app/useDocumentFlow';
import { useAiRenderBridge } from './app/useAiRenderBridge';
import { useAppIpc } from './app/useAppIpc';
import { useViewerSync } from './app/useViewerSync';
import { TabBar } from './components/TabBar';
import { Statusbar } from './components/Statusbar';
import { Loading } from './components/Loading';
import { Welcome } from './components/Welcome';
import { WorkspaceBadge } from './components/WorkspaceBadge';
import { WorkspaceSuggest } from './components/WorkspaceSuggest';
import { UpdateBanner } from './components/UpdateBanner';
import { SettingsModal } from './components/SettingsModal';
import { CatalogModal } from './components/CatalogModal';
import { ModulesModal } from './components/ModulesModal';
import { VersionSelectModal } from './components/VersionSelectModal';
import { RenameProjectModal } from './components/RenameProjectModal';
import { ImagePreview } from './components/ImagePreview';
import { InspectorDock, FloatingPanels } from './components/InspectorDock';
import { BuildPlanner, NewBuildPanel } from './components/generate/BuildPlanner';
import { StageBuilding } from './components/generate/StageBuilding';
import { ConsoleDock } from './components/ConsoleDock';
import { ShortcutsHelp } from './components/ShortcutsHelp';
import { GuideModal } from './components/GuideModal';
import { ExportModal } from './components/export/ExportModal';
import { EditorPanel } from './components/editor/EditorPanel';
import { EditorLayer } from './components/editor/EditorLayer';
import { editorStore } from './state/editor';

function Shell() {
  const viewer = useViewer();
  const captureViewer = useCaptureViewer();
  const activeDoc = useActiveDoc();
  const structure = activeDoc?.structure ?? null;
  const fileOpen = structure !== null;
  const availability = {
    inspector: fileOpen,
    jigsaw: structure !== null && structure.jigsaws.length > 0,
    // Generate is the ITERATION chat — it shows only once there's something to iterate on:
    // an open structure, a build in flight, or a tab that already produced versions. A
    // brand-new blank build tab shows ONLY the inline planner, and Home shows neither — so
    // the dock is never a redundant second Generate surface beside the planner/hero card.
    generate: fileOpen || (activeDoc?.busy ?? false) || (activeDoc?.versions.length ?? 0) > 0,
    // Versions is available once this tab has at least one generated build.
    versions: (activeDoc?.versions.length ?? 0) > 0,
  };

  // The render/IPC handlers read the latest viewers from refs so they can stay stable.
  const viewerRef = useRef(viewer);
  viewerRef.current = viewer;
  const captureRef = useRef(captureViewer);
  captureRef.current = captureViewer;

  const flow = useDocumentFlow(viewerRef);
  useAiRenderBridge(viewerRef, captureRef);
  useAppIpc(flow);
  useViewerSync(viewer);

  // Leave edit mode when the active tab changes, so a selection never bleeds across docs.
  useEffect(() => {
    editorStore.getState().setActive(false);
  }, [activeDoc?.id]);

  return (
    <>
      <div className="topbar">
        <TabBar onNew={flow.newDoc} onClose={flow.closeDocById} />
      </div>
      <div className="stage-area">
        <div className="stage-col">
          <main className="stage">
            <div className="stage-main">
              <Viewport />
              {!activeDoc && (
                <Welcome
                  onOpen={() => void flow.open()}
                  onLoad={(p) => void flow.openFile(p)}
                  onActivateWorkspace={(ws) => void api.activateWorkspace(ws)}
                  onGenerate={flow.newDoc}
                  onExample={(text) => {
                    // Start a fresh build pre-filled with the example prompt: newDoc resets
                    // the planner draft, so set the notes AFTER it lands on the planner.
                    flow.newDoc();
                    plannerStore.getState().setNotes(text);
                  }}
                />
              )}
              {activeDoc && !fileOpen && !activeDoc.loading && (
                activeDoc.busy ? (
                  <StageBuilding progress={activeDoc.progress ?? null} startedAt={activeDoc.startedAt ?? null} />
                ) : (
                  <NewBuildPanel />
                )
              )}
              <FloatingPanels availability={availability} />
              {fileOpen && <EditorLayer />}
              {fileOpen && <EditorPanel />}
              {/* The Generate surface (new-build planner / building stage) puts its config
                  column on the left, so the badge sits bottom-right there to stay clear of it. */}
              <WorkspaceBadge side={activeDoc && !fileOpen ? 'right' : 'left'} />
              <WorkspaceSuggest
                onAccept={() => void flow.acceptSuggest()}
                onDismiss={() => store.getState().setSuggest(null)}
              />
              <UpdateBanner />
              <ShortcutsHelp available={fileOpen} />
              <Loading />
            </div>
          </main>
          <ConsoleDock />
        </div>
        <InspectorDock availability={availability} />
        <BuildPlanner />
      </div>
      <Statusbar />
      <SettingsModal />
      <CatalogModal />
      <ModulesModal />
      <VersionSelectModal />
      <RenameProjectModal />
      <GuideModal />
      <ExportModal />
      <ImagePreview />
    </>
  );
}

export function App() {
  return (
    <div className={`shell platform-${api.platform}`}>
      <ViewerProvider>
        <Shell />
      </ViewerProvider>
    </div>
  );
}
