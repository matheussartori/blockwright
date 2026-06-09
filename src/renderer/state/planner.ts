// The full-stage Build Planner's state: whether the planner is open, the BuildDetails
// the user is assembling (structure/decoration/roof/basement/params/size/rooms) and the
// free-text notes appended to the brief. Lifted out of the Generate dock so the planner
// can take over the whole stage (App renders <BuildPlanner/> when `open`) while the chat
// dock just launches it. The detail edits themselves are the pure reducers in
// generation/details.ts; this store only holds + applies them. Transient (not persisted).
import { createStore } from 'zustand/vanilla';
import { type BuildDetails, EMPTY_DETAILS } from '../generation/brief';

export interface PlannerStore {
  /** Whether the full-stage planner is showing. */
  open: boolean;
  /** The build the user is assembling. */
  details: BuildDetails;
  /** Free-text guidance appended to the generated brief (the "additional notes"). */
  notes: string;
  openPlanner: () => void;
  closePlanner: () => void;
  /** Apply a pure reducer (generation/details.ts) to the working details. */
  setDetails: (update: (d: BuildDetails) => BuildDetails) => void;
  setNotes: (notes: string) => void;
  /** Forget the working build (after a successful send, or "Start over"). */
  reset: () => void;
}

export const plannerStore = createStore<PlannerStore>((set) => ({
  open: false,
  details: EMPTY_DETAILS,
  notes: '',
  openPlanner: () => set({ open: true }),
  closePlanner: () => set({ open: false }),
  setDetails: (update) => set((s) => ({ details: update(s.details) })),
  setNotes: (notes) => set({ notes }),
  reset: () => set({ details: EMPTY_DETAILS, notes: '' }),
}));
