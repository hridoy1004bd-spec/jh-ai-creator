import type { Clip, ClipEffects, Project, SourceDeclaration } from './types';

let counter = 0;
export const uid = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`;

export const DEFAULT_EFFECTS: ClipEffects = { brightness: 100, contrast: 100, saturation: 100, zoom: 100 };
export const MIN_CLIP = 0.2; // seconds

export const clipDur = (c: Clip) => c.outPoint - c.inPoint;

export function createProject(title = 'Untitled'): Project {
  return {
    id: uid('p'),
    title,
    aspect: '16:9',
    fps: 30,
    tracks: [{ id: 'v1', kind: 'video', clipIds: [], muted: false }],
    clips: {},
    version: 1,
  };
}

export const orderedClips = (p: Project): Clip[] =>
  p.tracks[0].clipIds.map((id) => p.clips[id]).filter(Boolean);

export const totalDuration = (p: Project) => orderedClips(p).reduce((s, c) => s + clipDur(c), 0);

export function clipAt(p: Project, t: number): Clip | undefined {
  return orderedClips(p).find((c) => t >= c.start && t < c.start + clipDur(c));
}

// Phase 2: a single gapless video track. Multi-track comes later.
function layout(p: Project, ids: string[], clips: Record<string, Clip>): Project {
  let t = 0;
  const next: Record<string, Clip> = {};
  for (const id of ids) {
    next[id] = { ...clips[id], start: t };
    t += clipDur(clips[id]);
  }
  return {
    ...p,
    clips: next,
    tracks: [{ ...p.tracks[0], clipIds: ids }, ...p.tracks.slice(1)],
    version: p.version + 1,
  };
}

export function addClip(p: Project, assetId: string, duration: number, declaration: SourceDeclaration): Project {
  const c: Clip = {
    id: uid('c'),
    trackId: p.tracks[0].id,
    assetId,
    start: 0,
    inPoint: 0,
    outPoint: duration,
    effects: { ...DEFAULT_EFFECTS },
    declaration,
  };
  return layout(p, [...p.tracks[0].clipIds, c.id], { ...p.clips, [c.id]: c });
}

/** Split at timeline time t. Returns null if too close to an edge. */
export function splitClip(p: Project, clipId: string, t: number): Project | null {
  const c = p.clips[clipId];
  if (!c) return null;
  const at = c.inPoint + (t - c.start);
  if (at - c.inPoint < MIN_CLIP || c.outPoint - at < MIN_CLIP) return null;
  const a: Clip = { ...c, outPoint: at };
  const b: Clip = { ...c, id: uid('c'), inPoint: at };
  const ids = p.tracks[0].clipIds.flatMap((id) => (id === clipId ? [a.id, b.id] : [id]));
  return layout(p, ids, { ...p.clips, [a.id]: a, [b.id]: b });
}

/** Delete a clip and close the gap (ripple). */
export function deleteClip(p: Project, clipId: string): Project {
  const ids = p.tracks[0].clipIds.filter((id) => id !== clipId);
  const clips = { ...p.clips };
  delete clips[clipId];
  return layout(p, ids, clips);
}

export function updateClip(p: Project, clipId: string, patch: Partial<Clip>): Project {
  if (!p.clips[clipId]) return p;
  return { ...p, clips: { ...p.clips, [clipId]: { ...p.clips[clipId], ...patch } }, version: p.version + 1 };
}
