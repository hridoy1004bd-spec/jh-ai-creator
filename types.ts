export type TrackKind = 'video' | 'audio' | 'text';

export type SourceDeclaration =
  | 'own'
  | 'ai'
  | 'licensed'
  | 'public_domain'
  | 'third_party'
  | 'unverified';

export interface ClipEffects {
  brightness: number; // 100 = original
  contrast: number;
  saturation: number;
  zoom: number; // 100..200
}

export interface Clip {
  id: string;
  trackId: string;
  assetId: string;
  start: number; // position on the timeline (sec), computed by layout()
  inPoint: number; // source in (sec)
  outPoint: number; // source out (sec)
  effects: ClipEffects;
  declaration: SourceDeclaration;
  text?: string; // text / subtitle clips (later phases)
}

export interface Track {
  id: string;
  kind: TrackKind;
  clipIds: string[];
  muted: boolean;
}

export interface Project {
  id: string;
  title: string;
  aspect: '16:9' | '9:16' | '1:1';
  fps: 24 | 30 | 60;
  tracks: Track[];
  clips: Record<string, Clip>;
  version: number;
}

/** Runtime only, never persisted: object URLs die on reload. */
export interface Asset {
  id: string;
  name: string;
  url: string;
  duration: number;
  width: number;
  height: number;
}
