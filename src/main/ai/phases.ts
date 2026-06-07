// The design phases the review loop drives the model through — one focused pass at
// a time — instead of a single vague "make it better". The orchestrator
// (generate.ts) owns the phase pointer and, after each emit_structure, feeds back
// the rubric for the NEXT pass: nail the massing before the roof, the roof before
// the facade, and so on. The sequence is provider-agnostic (the orchestrator drives
// it); a model may also report the pass it just worked on via emit_structure's
// optional `phase`, used only to label progress. Rubrics condense the relevant hard
// rules from knowledge/nbt/10-design-principles.md and 12-exterior-and-facade-detailing.md.

export interface Phase {
  id: string;
  /** Short UI label (shown in progress, e.g. "Facade"). */
  label: string;
  /** Preferred emit mode for the pass — detail passes patch the previous version. */
  mode: 'full' | 'patch';
  /** The focused checklist fed back to the model for this pass. */
  rubric: string;
}

export const PHASES: Phase[] = [
  {
    id: 'massing',
    label: 'Massing',
    mode: 'full',
    rubric:
      'Get the overall FORM right first. Set the footprint, proportions and storey heights, and give the ' +
      'build an articulated, non-cube silhouette — an irregular plan (L/T/U footprint, a wing, bay, porch ' +
      'or tower) with a front that differs from the back. Make every habitable volume a SHELL (hollow / ' +
      'walls + floor + ceiling), never a solid fill, and size the box for the whole build. For a cellar/basement ' +
      'stand it up with the "large_basement" template (it gives a varied, non-square plan for free), and SINK ' +
      'it so its ceiling sits ~2 blocks below the ground floor — a buried basement, not one level with the ' +
      'surface, so uneven in-game terrain will not expose its walls beside the house. Do NOT add the roof, ' +
      'facade detail or interiors yet — just the massing.',
  },
  {
    id: 'roof',
    label: 'Roof',
    mode: 'patch',
    rubric:
      'Add a real ROOF with the "roof" op: pitched or edged, with an OVERHANG past the walls, and NO holes ' +
      'or gaps along the ridge and eaves. The two slopes must MEET and CLOSE at the apex — looking straight ' +
      'down from above you must NOT see an open slot along the top into the attic (the classic open-ridge bug ' +
      'where the slopes stop one row short of meeting). Cap the ridge so the roof surface is continuous. ' +
      'No flat lid. Match the roof pitch and material to the style; give ' +
      'distinct wings/sections their own roofs rather than one giant span. Do NOT hand-place a slab ridge-cap ' +
      'or a slab "shelf" cantilevered off the ridge/chimney with air beneath it (the classic floating-slab bug) ' +
      '— let the roof op cap the ridge. Give the house EXACTLY ONE chimney (a normal home has a single flue; ' +
      'only a large multi-wing manor gets more): a CONTINUOUS solid column with NO gaps, rising from the ' +
      'hearth/firebox at floor level up THROUGH the roof to ~1–3 blocks past the ridge, with its campfire/cap ' +
      'block RESTING on the column top — NEVER a campfire floating in the air, a stack that stops below the ' +
      'roofline (incomplete), or a second stray chimney. The only slabs with air below them should be a ' +
      'continuous eave running along the wall line. ' +
      'CLOSE the gable-end triangles — the vertical wall under each slope at the two ends — so you can\'t see ' +
      'into the attic (pass "fill" to the roof op, or wall them yourself; they may hold a window but must not be open).',
  },
  {
    id: 'facade',
    label: 'Facade',
    mode: 'patch',
    rubric:
      'Give the EXTERIOR walls depth and articulation: framed window reveals, a string course / trim band, ' +
      'slight offsets or pilasters so walls are not flat, a grounded base course, and a FRAMED ENTRANCE ' +
      'A base course / string course / plinth / trim band follows the WALL LINE ONLY: it must BREAK at every ' +
      'door, gateway and interior opening, and must never run as a solid band across an open passage or where ' +
      'there is no wall behind it — that walls off the room and blocks the walkway (the "cobblestone barrier ' +
      'across the doorway" bug). Put trim only on the face of an actual wall. ' +
      '(porch, portal or recessed doorway — not a bare hole). Use 3-5 cohesive materials. Believable, not noisy. ' +
      'WINDOWS must read as deliberate and symmetric: even spacing, aligned across storeys, and CENTERED on ' +
      'the face with EQUAL END MARGINS — the wall left of the first window must equal the wall right of the ' +
      'last (compute it: leftover = W − n·w − (n−1)·g must split evenly into two ends; change the count/width/' +
      'gap until it does). Never leave one end 2 blocks and the other 3. Odd window counts centre most easily; ' +
      'use an odd window width (1 or 3 wide) on each bay rather than a 2-wide window jammed against one side.',
  },
  {
    id: 'interior',
    label: 'Interior',
    mode: 'patch',
    rubric:
      'FURNISH and LIGHT every habitable room. Partition large spaces into real rooms joined by doorways; ' +
      'line each room\'s walls with faux-furniture, storage and wall decoration, leaving the centre as ' +
      'walking space. Light each room with VISIBLE fixtures (~1 every 6 blocks). An empty room is a failure. ' +
      'Decoration goes in AIR cells against the structure — never overwriting a wall/floor/ceiling block. ' +
      'If the roof encloses a usable ATTIC, make it accessible (a ladder + a trapdoor hatch in the top ceiling) ' +
      'and furnish it — never leave it sealed and empty.',
  },
  {
    id: 'circulation',
    label: 'Circulation',
    mode: 'patch',
    rubric:
      'Make the build WALKABLE, and CONNECT EVERY FLOOR. Trace the route from the front door to each level ' +
      '— basement, every storey, AND the attic: each must be reachable by an UNBROKEN stair/ladder chain. The ' +
      '#1 bug here is stranding the upper floors (a ladder/stair only on the bottom segment, the floors above ' +
      'left with just an open hole and no way up). Use ONE mechanism per shaft (a "stairs" flight OR a wall ' +
      'ladder, never both stacked), and if you ladder, run a SINGLE continuous "ladder" column from the bottom ' +
      'floor up to the top floor it serves, flush on a solid interior wall, with a 1×1 hole through each floor ' +
      'it passes — do NOT also carve the shaft with air "fill" ops (that guts the floors into an unclimbable ' +
      'pit). Build every floor-to-floor staircase with the "stairs" OP (from = bottom ' +
      'step, to = top step), NEVER hand-placed individual steps — the op guarantees a full, same-direction ' +
      'flight that REACHES the upper floor with headroom and a stairwell hole, instead of a couple of stray ' +
      'steps that dead-end half a level short. Every staircase needs a clear LANDING at its bottom, 2 blocks ' +
      'of headroom, and a stairwell hole through the floor above — and must NOT block a doorway or a ' +
      "container's front. Its top tread must be level with the floor it serves so you walk straight off it. " +
      'Put basement/upper access in a BACK CORNER or side room — NEVER in the entrance bay or the high-traffic ' +
      'path right inside the front door (a stair descending in front of the door is a bad layout). Keep every ' +
      'flight at least ONE cell OFF the outer walls — never flush in a corner or hugging a wall — so there is ' +
      'standing/approach room beside it and the headroom carve does not gut a structural wall. The stair ' +
      'DOWN to the cellar must LAND in open cellar floor (a usable area) — it must not pierce the cellar shell ' +
      'and dead-end in a wall or in dirt; if there is no open floor where it lands, ENLARGE the cellar so the ' +
      'landing sits inside it. Keep door swing space and the cell in front of every chest/furnace/ladder clear.',
  },
  {
    id: 'audit',
    label: 'Audit',
    mode: 'patch',
    rubric:
      'FINAL audit. Go through the audit checklist item by item against the screenshots and REPORT your verdict ' +
      'in the "audit" field (one entry per check: its id, ok true/false, and a short note on what you see). Patch ' +
      'every item you mark NOT ok, then re-emit and re-report. You are only done when every check passes — do not ' +
      'stop with an open issue, and do not keep tweaking a build where they all pass.',
  },
];

/** Phase ids in workflow order. The single source for the AI tool schema's
 *  `phase` enum (don't restate the list elsewhere). */
export const PHASE_IDS = PHASES.map((p) => p.id);

const clamp = (i: number): number => Math.max(0, Math.min(i, PHASES.length - 1));

/** The phase at `index` (clamped to the valid range). */
export function phaseAt(index: number): Phase {
  return PHASES[clamp(index)];
}

/** Index of the phase with id `id`, or -1 if unknown/undefined. */
export function phaseIndexOf(id: string | undefined): number {
  return id === undefined ? -1 : PHASES.findIndex((p) => p.id === id);
}

/** Next pass index (clamped — the audit pass is terminal). */
export function advancePhase(index: number): number {
  return clamp(index + 1);
}

/** Is `index` the final (audit) pass? */
export function isLastPhase(index: number): boolean {
  return clamp(index) >= PHASES.length - 1;
}

/** The briefing fed back to the model for the pass at `index`. */
export function phaseBriefing(index: number): string {
  const i = clamp(index);
  const p = PHASES[i];
  return `DESIGN PASS ${i + 1}/${PHASES.length} — ${p.label.toUpperCase()} (emit mode "${p.mode}"): ${p.rubric}`;
}

// ── Audit checklist (the critic) ─────────────────────────────────────────────
// The final Audit pass is gated: the model must report a pass/fail (+note) for each
// of these checks before the orchestrator will let it stop. They target the
// aesthetic/layout failures that can't be enforced in code.

export interface AuditCheck {
  id: string;
  label: string;
  ask: string;
}

export const AUDIT_CHECKS: AuditCheck[] = [
  { id: 'massing', label: 'Massing', ask: 'Is the silhouette articulated (NOT a plain cube), with the front different from the back?' },
  { id: 'roof', label: 'Roof', ask: 'Pitched/edged roof with an overhang and NO holes; the apex/ridge CLOSED so looking straight down you do NOT see an open slot into the attic (slopes meet at the top, not one row short); gable-end triangles CLOSED (not open into the attic); NO slabs perched/floating off the ridge or chimney; EXACTLY ONE chimney that is a continuous column running from the hearth THROUGH the roof to ~1–3 past the ridge with its cap resting on it (no floating campfire, no chimney stopping below the roofline, no second chimney)?' },
  { id: 'facade', label: 'Facade', ask: 'Windows symmetric and centered with EQUAL end margins (not 2 one side, 3 the other), aligned across storeys; walls articulated with depth; a framed entrance (not a bare hole)?' },
  { id: 'interior', label: 'Interior', ask: 'Is EVERY habitable room both furnished and lit (no empty boxes), and any usable attic accessible + furnished (not sealed/empty)?' },
  { id: 'circulation', label: 'Circulation', ask: 'Is EVERY floor — basement, each storey, AND the attic — reachable from the entrance by an UNBROKEN stair/ladder chain (NOT just the bottom segment, with upper floors left as an open hole and no rungs)? Each shaft uses ONE mechanism (stairs OR a single continuous wall-ladder column, not both, not an air-carved pit). Stairs have a clear landing at the bottom AND top, headroom, REACH the floor they serve (no jump), sit at least ONE cell OFF the outer walls, and do not block any door; the cellar stair LANDS in open cellar floor; a balcony is a walkable platform (≥2 deep beyond the door, railed), not just the door sill; doors are walkable? No trim band / plinth / decorative strip runs across an open doorway or passage to wall it off — every interior opening is clear to walk through?' },
  { id: 'physical', label: 'Physical validity', ask: 'Nothing floating; interactive blocks (chests/furnaces) face the room; chest tops are clear; the basement is sunk below the ground floor; the chimney flue path is clear (no bed/floor/furniture crossing it or directly above the hearth)?' },
];

/** Audit check ids. The single source for the AI tool schema's audit `check`
 *  enum (note these differ from PHASE_IDS — there's a `physical` check but no
 *  `audit` check). */
export const AUDIT_CHECK_IDS = AUDIT_CHECKS.map((c) => c.id);

/** The checklist rendered for the audit briefing. */
export function auditChecklistText(): string {
  return AUDIT_CHECKS.map((c, i) => `${i + 1}. ${c.label} — ${c.ask}`).join('\n');
}

export interface AuditReport {
  check: string;
  ok: boolean;
  note?: string;
}

export interface AuditSummary {
  /** Did the model supply a checklist at all? */
  reported: boolean;
  /** Reported and every item passed. */
  allOk: boolean;
  /** The items the model flagged as failing. */
  failed: { id: string; label: string; note: string }[];
}

/** Reduce a model-reported audit to {reported, allOk, failed}. */
export function summarizeAudit(reported: AuditReport[] | undefined): AuditSummary {
  if (!reported || reported.length === 0) return { reported: false, allOk: false, failed: [] };
  const failed = reported
    .filter((r) => r && r.ok === false)
    .map((r) => {
      const def = AUDIT_CHECKS.find((c) => c.id === r.check);
      return { id: r.check, label: def?.label ?? r.check, note: (r.note ?? '').trim() };
    });
  return { reported: true, allOk: failed.length === 0, failed };
}

/** A compact overview of the whole sequence for the system prompt. */
export function phaseOverview(): string {
  const steps = PHASES.map((p, i) => `${i + 1}. ${p.label} (mode "${p.mode}")`).join(' → ');
  return (
    'Build in ordered DESIGN PASSES, calling emit_structure once per pass and reviewing the screenshots ' +
    `between them: ${steps}. Do the EARLIER passes first (get massing and roof right before facade and ` +
    'interior detail). After each emit the tool result tells you which pass is next and what it must ' +
    'satisfy — follow it. Use mode "full" for the first (massing) pass and mode "patch" for the detail ' +
    'passes (append only the new/corrected ops — far cheaper). Report the pass you just did in the ' +
    'optional "phase" field. Stop after the final Audit pass when the build reads well.'
  );
}
