// The in-app user Guide (Help ▸ Guide / Cmd+Shift+?). A two-column modal: a section rail on
// the left, illustrated content on the right. The illustrations are inline SVG diagrams
// (themed via currentColor + CSS vars, so they track light/dark) — a build-flow diagram, a
// viewer-controls diagram, and a composition diagram — so the guide teaches the model visually,
// not just in prose. All copy is i18n (en + pt-BR). Built on the shared Modal shell.
import { useState, type ReactNode } from 'react';
import {
  Compass, Sparkles, Orbit, Blocks, MessagesSquare, FolderTree,
  MousePointer2, Move3D, Eye, Layers, PencilLine, SlidersHorizontal, History,
  Boxes, ArrowUpFromLine, TrendingUp, Replace, Save, Upload, FlipHorizontal2,
  Columns2, FileDown, Globe, Package, Brush, SquareDashed, CircleHelp, Search, Map, RefreshCcw,
  Camera, GitCompareArrows, Paintbrush, Stethoscope,
} from 'lucide-react';
import { store } from '../state/store';
import { useApp, useT } from '../hooks/useStores';
import { Modal } from './ui/Modal';
import type { MessageKey, TFunction } from '@/shared/i18n';

type SectionId = 'overview' | 'generate' | 'viewer' | 'details' | 'edit' | 'blocks' | 'tools' | 'world' | 'export' | 'workspaces';

const SECTIONS: { id: SectionId; icon: typeof Compass; label: MessageKey }[] = [
  { id: 'overview', icon: Compass, label: 'guide.navOverview' },
  { id: 'generate', icon: Sparkles, label: 'guide.navGenerate' },
  { id: 'viewer', icon: Orbit, label: 'guide.navViewer' },
  { id: 'details', icon: Blocks, label: 'guide.navDetails' },
  { id: 'edit', icon: MessagesSquare, label: 'guide.navEdit' },
  { id: 'blocks', icon: Boxes, label: 'guide.navBlocks' },
  { id: 'tools', icon: GitCompareArrows, label: 'guide.navTools' },
  { id: 'world', icon: Globe, label: 'guide.navWorld' },
  { id: 'export', icon: Upload, label: 'guide.navExport' },
  { id: 'workspaces', icon: FolderTree, label: 'guide.navWorkspaces' },
];

export function GuideModal() {
  const t = useT();
  const open = useApp((s) => s.guideOpen);
  const [section, setSection] = useState<SectionId>('overview');
  const close = () => store.getState().setGuideOpen(false);

  return (
    <Modal
      open={open}
      onClose={close}
      className="modal-lg guide-modal"
      bodyClassName="guide-body"
      title={
        <span className="guide-modal-title">
          <Compass size={18} strokeWidth={1.8} aria-hidden />
          {t('guide.title')}
        </span>
      }
    >
      <nav className="guide-nav" aria-label={t('guide.title')}>
        {SECTIONS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            className={`guide-nav-item${id === section ? ' active' : ''}`}
            onClick={() => setSection(id)}
          >
            <Icon size={16} strokeWidth={1.8} aria-hidden />
            {t(label)}
          </button>
        ))}
        <span className="guide-nav-foot">{t('guide.footerTip')}</span>
      </nav>
      <div className="guide-content" key={section}>
        {section === 'overview' && <Overview t={t} />}
        {section === 'generate' && <Generate t={t} />}
        {section === 'viewer' && <Viewer t={t} />}
        {section === 'details' && <Details t={t} />}
        {section === 'edit' && <Edit t={t} />}
        {section === 'blocks' && <BlockTools t={t} />}
        {section === 'tools' && <StudioTools t={t} />}
        {section === 'world' && <World t={t} />}
        {section === 'export' && <Export t={t} />}
        {section === 'workspaces' && <Workspaces t={t} />}
      </div>
    </Modal>
  );
}

/** A titled content block with a leading icon. */
function Block({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="guide-section">
      <h3 className="guide-h">
        <span className="guide-h-ic">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Overview({ t }: { t: TFunction }) {
  return (
    <Block icon={<Compass size={18} strokeWidth={1.8} />} title={t('guide.overview.title')}>
      <p className="guide-lead">{t('guide.overview.lead')}</p>
      <div className="guide-cards">
        <div className="guide-card"><Sparkles size={18} strokeWidth={1.7} aria-hidden /><span>{t('guide.overview.cardGenerate')}</span></div>
        <div className="guide-card"><Orbit size={18} strokeWidth={1.7} aria-hidden /><span>{t('guide.overview.cardView')}</span></div>
        <div className="guide-card"><MessagesSquare size={18} strokeWidth={1.7} aria-hidden /><span>{t('guide.overview.cardEdit')}</span></div>
        <div className="guide-card"><FolderTree size={18} strokeWidth={1.7} aria-hidden /><span>{t('guide.overview.cardMods')}</span></div>
      </div>
      <p className="guide-p">{t('guide.overview.p1')}</p>
      <p className="guide-p">{t('guide.overview.formats')}</p>
    </Block>
  );
}

function Generate({ t }: { t: TFunction }) {
  return (
    <Block icon={<Sparkles size={18} strokeWidth={1.8} />} title={t('guide.generate.title')}>
      <p className="guide-lead">{t('guide.generate.lead')}</p>
      <FlowDiagram t={t} />
      <ol className="guide-steps">
        <li><b>{t('guide.generate.s1t')}</b> {t('guide.generate.s1')}</li>
        <li><b>{t('guide.generate.s2t')}</b> {t('guide.generate.s2')}</li>
        <li><b>{t('guide.generate.s3t')}</b> {t('guide.generate.s3')}</li>
        <li><b>{t('guide.generate.s4t')}</b> {t('guide.generate.s4')}</li>
      </ol>
      <p className="guide-tip"><Sparkles size={14} strokeWidth={1.9} aria-hidden />{t('guide.generate.tip')}</p>
    </Block>
  );
}

function Viewer({ t }: { t: TFunction }) {
  return (
    <Block icon={<Orbit size={18} strokeWidth={1.8} />} title={t('guide.viewer.title')}>
      <p className="guide-lead">{t('guide.viewer.lead')}</p>
      <ViewerDiagram t={t} />
      <ul className="guide-list">
        <li><MousePointer2 size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.viewer.orbitT')}</b> {t('guide.viewer.orbit')}</span></li>
        <li><Move3D size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.viewer.flyT')}</b> {t('guide.viewer.fly')}</span></li>
        <li><Eye size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.viewer.insideT')}</b> {t('guide.viewer.inside')}</span></li>
        <li><CircleHelp size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.viewer.helpT')}</b> {t('guide.viewer.help')}</span></li>
      </ul>
    </Block>
  );
}

function Details({ t }: { t: TFunction }) {
  return (
    <Block icon={<Blocks size={18} strokeWidth={1.8} />} title={t('guide.details.title')}>
      <p className="guide-lead">{t('guide.details.lead')}</p>
      <CompositionDiagram t={t} />
      <ul className="guide-list">
        <li><Blocks size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.details.structureT')}</b> {t('guide.details.structure')}</span></li>
        <li><Layers size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.details.decorationT')}</b> {t('guide.details.decoration')}</span></li>
        <li><PencilLine size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.details.partsT')}</b> {t('guide.details.parts')}</span></li>
      </ul>
      <p className="guide-tip"><Blocks size={14} strokeWidth={1.9} aria-hidden />{t('guide.details.tip')}</p>
    </Block>
  );
}

function Edit({ t }: { t: TFunction }) {
  return (
    <Block icon={<MessagesSquare size={18} strokeWidth={1.8} />} title={t('guide.edit.title')}>
      <p className="guide-lead">{t('guide.edit.lead')}</p>
      <ul className="guide-list">
        <li><MessagesSquare size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.edit.chatT')}</b> {t('guide.edit.chat')}</span></li>
        <li><SlidersHorizontal size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.edit.advancedT')}</b> {t('guide.edit.advanced')}</span></li>
        <li><History size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.edit.versionsT')}</b> {t('guide.edit.versions')}</span></li>
      </ul>
      <p className="guide-tip"><MessagesSquare size={14} strokeWidth={1.9} aria-hidden />{t('guide.edit.tip')}</p>
    </Block>
  );
}

function BlockTools({ t }: { t: TFunction }) {
  return (
    <Block icon={<Boxes size={18} strokeWidth={1.8} />} title={t('guide.blocks.title')}>
      <p className="guide-lead">{t('guide.blocks.lead')}</p>
      <ul className="guide-list">
        <li><MousePointer2 size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.blocks.selectT')}</b> {t('guide.blocks.select')}</span></li>
        <li><Move3D size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.blocks.moveT')}</b> {t('guide.blocks.move')}</span></li>
        <li><Brush size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.blocks.paintT')}</b> {t('guide.blocks.paint')}</span></li>
        <li><FlipHorizontal2 size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.blocks.transformT')}</b> {t('guide.blocks.transform')}</span></li>
        <li><ArrowUpFromLine size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.blocks.extrudeT')}</b> {t('guide.blocks.extrude')}</span></li>
        <li><TrendingUp size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.blocks.stairsT')}</b> {t('guide.blocks.stairs')}</span></li>
        <li><Replace size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.blocks.replaceT')}</b> {t('guide.blocks.replace')}</span></li>
        <li><SquareDashed size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.blocks.voidT')}</b> {t('guide.blocks.void')}</span></li>
        <li><Columns2 size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.blocks.symmetryT')}</b> {t('guide.blocks.symmetry')}</span></li>
      </ul>
      <p className="guide-tip"><Save size={14} strokeWidth={1.9} aria-hidden />{t('guide.blocks.tip')}</p>
    </Block>
  );
}

function World({ t }: { t: TFunction }) {
  return (
    <Block icon={<Globe size={18} strokeWidth={1.8} />} title={t('guide.world.title')}>
      <p className="guide-lead">{t('guide.world.lead')}</p>
      <ul className="guide-list">
        <li><Move3D size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.world.flyT')}</b> {t('guide.world.fly')}</span></li>
        <li><Search size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.world.findT')}</b> {t('guide.world.find')}</span></li>
        <li><Map size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.world.hudT')}</b> {t('guide.world.hud')}</span></li>
        <li><RefreshCcw size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.world.backT')}</b> {t('guide.world.back')}</span></li>
      </ul>
      <p className="guide-tip"><Globe size={14} strokeWidth={1.9} aria-hidden />{t('guide.world.tip')}</p>
    </Block>
  );
}

function Export({ t }: { t: TFunction }) {
  return (
    <Block icon={<Upload size={18} strokeWidth={1.8} />} title={t('guide.export.title')}>
      <p className="guide-lead">{t('guide.export.lead')}</p>
      <ul className="guide-list">
        <li><FileDown size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.export.fileT')}</b> {t('guide.export.file')}</span></li>
        <li><Package size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.export.modT')}</b> {t('guide.export.mod')}</span></li>
        <li><Globe size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.export.worldT')}</b> {t('guide.export.world')}</span></li>
      </ul>
      <p className="guide-tip"><Boxes size={14} strokeWidth={1.9} aria-hidden />{t('guide.export.tip')}</p>
    </Block>
  );
}

function StudioTools({ t }: { t: TFunction }) {
  return (
    <Block icon={<GitCompareArrows size={18} strokeWidth={1.8} />} title={t('guide.tools.title')}>
      <p className="guide-lead">{t('guide.tools.lead')}</p>
      <ul className="guide-list">
        <li><GitCompareArrows size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.tools.diffT')}</b> {t('guide.tools.diff')}</span></li>
        <li><Paintbrush size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.tools.rethemeT')}</b> {t('guide.tools.retheme')}</span></li>
        <li><Camera size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.tools.renderT')}</b> {t('guide.tools.render')}</span></li>
        <li><Stethoscope size={15} strokeWidth={1.8} aria-hidden /><span><b>{t('guide.tools.doctorT')}</b> {t('guide.tools.doctor')}</span></li>
      </ul>
      <p className="guide-tip"><RefreshCcw size={14} strokeWidth={1.9} aria-hidden />{t('guide.tools.watch')}</p>
    </Block>
  );
}

function Workspaces({ t }: { t: TFunction }) {
  return (
    <Block icon={<FolderTree size={18} strokeWidth={1.8} />} title={t('guide.workspaces.title')}>
      <p className="guide-lead">{t('guide.workspaces.lead')}</p>
      <p className="guide-p">{t('guide.workspaces.p1')}</p>
      <p className="guide-p">{t('guide.workspaces.p2')}</p>
      <p className="guide-p">{t('guide.workspaces.p3')}</p>
      <p className="guide-tip"><Upload size={14} strokeWidth={1.9} aria-hidden />{t('guide.workspaces.export')}</p>
    </Block>
  );
}

/* ---------------------------------------------------------------------------- */
/* Inline SVG diagrams — themed via currentColor + CSS vars (track light/dark). */
/* ---------------------------------------------------------------------------- */

/** The build flow: Describe → Configure → Generate → Refine, as connected nodes. */
function FlowDiagram({ t }: { t: TFunction }) {
  const nodes = [
    { x: 8, label: t('guide.flow.describe') },
    { x: 96, label: t('guide.flow.configure') },
    { x: 184, label: t('guide.flow.generate') },
    { x: 272, label: t('guide.flow.refine') },
  ];
  return (
    <svg className="guide-diagram" viewBox="0 0 360 92" role="img" aria-label={t('guide.generate.title')}>
      {nodes.slice(0, -1).map((n, i) => (
        <line key={i} x1={n.x + 72} y1={36} x2={nodes[i + 1].x} y2={36} className="gd-arrow" markerEnd="url(#gd-ah)" />
      ))}
      <defs>
        <marker id="gd-ah" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" className="gd-arrow-head" />
        </marker>
      </defs>
      {nodes.map((n, i) => (
        <g key={n.label}>
          <rect x={n.x} y={16} width={72} height={40} rx={9} className={`gd-node${i === 2 ? ' accent' : ''}`} />
          <text x={n.x + 36} y={36} className="gd-node-label">{n.label}</text>
        </g>
      ))}
    </svg>
  );
}

/** The viewer controls: a model in a box with labelled drag/scroll/key affordances. */
function ViewerDiagram({ t }: { t: TFunction }) {
  return (
    <svg className="guide-diagram" viewBox="0 0 360 130" role="img" aria-label={t('guide.viewer.title')}>
      {/* ground + an isometric cube (a Minecraft block) */}
      <ellipse cx={180} cy={106} rx={84} ry={15} className="gd-ground" />
      <polygon points="180,34 238,56 180,78 122,56" className="gd-roof" />
      <polygon points="122,56 180,78 180,116 122,94" className="gd-wall" />
      <polygon points="180,78 238,56 238,94 180,116" className="gd-wall dim" />
      {/* orbit arrow ring */}
      <path d="M100,100 A82,24 0 0 0 260,100" className="gd-orbit" markerEnd="url(#gd-ah2)" />
      <defs>
        <marker id="gd-ah2" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M0,0 L7,4 L0,8 Z" className="gd-arrow-head" />
        </marker>
      </defs>
      <text x={64} y={120} className="gd-cap">{t('guide.viewer.capDrag')}</text>
      <text x={250} y={120} className="gd-cap">{t('guide.viewer.capScroll')}</text>
    </svg>
  );
}

/** The composition model: Structure × Decoration → the build, with roof/basement/room parts. */
function CompositionDiagram({ t }: { t: TFunction }) {
  return (
    <svg className="guide-diagram" viewBox="0 0 360 110" role="img" aria-label={t('guide.details.title')}>
      <rect x={8} y={26} width={92} height={34} rx={8} className="gd-node" />
      <text x={54} y={43} className="gd-node-label">{t('guide.comp.structure')}</text>
      <text x={114} y={43} className="gd-plus">×</text>
      <rect x={130} y={26} width={92} height={34} rx={8} className="gd-node" />
      <text x={176} y={43} className="gd-node-label">{t('guide.comp.decoration')}</text>
      <line x1={222} y1={43} x2={258} y2={43} className="gd-arrow" markerEnd="url(#gd-ah3)" />
      <defs>
        <marker id="gd-ah3" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" className="gd-arrow-head" />
        </marker>
      </defs>
      <rect x={262} y={20} width={90} height={46} rx={9} className="gd-node accent" />
      <text x={307} y={43} className="gd-node-label">{t('guide.comp.build')}</text>
      {/* part chips feeding the build */}
      {[t('guide.comp.roof'), t('guide.comp.basement'), t('guide.comp.rooms')].map((label, i) => (
        <g key={label}>
          <rect x={130 + i * 78} y={80} width={70} height={22} rx={11} className="gd-chip" />
          <text x={165 + i * 78} y={91} className="gd-chip-label">{label}</text>
        </g>
      ))}
    </svg>
  );
}
