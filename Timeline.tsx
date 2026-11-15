'use client';

import type { Asset, Project } from './types';
import { clipDur, orderedClips } from './model';

interface Props {
  project: Project;
  assets: Record<string, Asset>;
  t: number;
  total: number;
  selected: string | null;
  onSeek: (t: number) => void;
  onSelect: (id: string | null) => void;
}

export default function Timeline({ project, assets, t, total, selected, onSeek, onSelect }: Props) {
  const pct = (s: number) => (total > 0 ? (s / total) * 100 : 0);
  return (
    <div
      className="tl"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        if (total > 0) onSeek(Math.min(total - 0.001, Math.max(0, ((e.clientX - r.left) / r.width) * total)));
      }}
    >
      {orderedClips(project).map((c) => (
        <div
          key={c.id}
          className={`c d-${c.declaration}${c.id === selected ? ' sel' : ''}${assets[c.assetId] ? '' : ' miss'}`}
          style={{ left: pct(c.start) + '%', width: pct(clipDur(c)) + '%' }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(c.id === selected ? null : c.id);
            onSeek(c.start);
          }}
        >
          {assets[c.assetId]?.name ?? '?'}
        </div>
      ))}
      <div className="ph" style={{ left: pct(t) + '%' }} />
    </div>
  );
}
