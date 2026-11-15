'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Timeline from './Timeline';
import { commit, init, redo, undo } from './history';
import {
  DEFAULT_EFFECTS,
  addClip,
  clipAt,
  clipDur,
  createProject,
  deleteClip,
  orderedClips,
  splitClip,
  totalDuration,
  uid,
  updateClip,
} from './model';
import type { Asset, ClipEffects, Project, SourceDeclaration } from './types';
import { reviewProject } from '@/lib/copyright/review';
import { DEFAULT_FREE } from '@/lib/plans/config';
import { messages, type Lang } from '@/i18n/messages';

const DECLS: SourceDeclaration[] = ['own', 'ai', 'licensed', 'public_domain', 'third_party', 'unverified'];
const FX: { key: keyof ClipEffects; min: number; max: number }[] = [
  { key: 'brightness', min: 50, max: 150 },
  { key: 'contrast', min: 50, max: 150 },
  { key: 'saturation', min: 0, max: 200 },
  { key: 'zoom', min: 100, max: 200 },
];
const STORE = 'jh.project.v1';
const fmt = (s: number) => {
  const x = Math.max(0, s);
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${(x % 60).toFixed(1).padStart(4, '0')}`;
};

export default function EditorStudio() {
  const [lang, setLang] = useState<Lang>('bn');
  const m = messages[lang];
  const [h, setH] = useState(() => init(createProject()));
  const project = h.present;
  const [assets, setAssets] = useState<Record<string, Asset>>({});
  const [evidence, setEvidence] = useState<Set<string>>(new Set());
  const [newDecl, setNewDecl] = useState<SourceDeclaration>('own');
  const [sel, setSel] = useState<string | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState<Partial<ClipEffects>>({});
  const vref = useRef<HTMLVideoElement>(null);

  const total = totalDuration(project);
  const cur = clipAt(project, t);
  const selClip = sel ? project.clips[sel] : undefined;
  const fxClip = selClip ?? cur;
  const fx: ClipEffects = { ...(fxClip?.effects ?? DEFAULT_EFFECTS), ...draft };
  const shown: ClipEffects = cur ? (cur.id === fxClip?.id ? fx : cur.effects) : DEFAULT_EFFECTS;
  const review = useMemo(() => reviewProject(project, evidence), [project, evidence]);
  const missing = orderedClips(project).some((c) => !assets[c.assetId]);

  // Restore + autosave (project JSON only; media files are never stored here).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return;
      const p = JSON.parse(raw) as Project;
      if (p && Array.isArray(p.tracks) && p.clips && p.tracks[0]) {
        setH(init(p));
        if (p.tracks[0].clipIds.length) setNote(messages.bn.restored);
      }
    } catch {
      /* ignore corrupt data */
    }
  }, []);
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(STORE, JSON.stringify(project));
      } catch {
        /* storage full or blocked */
      }
    }, 500);
    return () => clearTimeout(id);
  }, [project]);

  // Keep the <video> in sync with the timeline position.
  useEffect(() => {
    const v = vref.current;
    if (!v) return;
    if (!cur) {
      v.pause();
      return;
    }
    const a = assets[cur.assetId];
    if (!a) return;
    if (v.dataset.aid !== a.id) {
      v.dataset.aid = a.id;
      v.src = a.url;
    }
    const want = cur.inPoint + (t - cur.start);
    if (Math.abs(v.currentTime - want) > 0.3) v.currentTime = want;
  }, [cur, t, assets]);

  useEffect(() => {
    const v = vref.current;
    if (!v) return;
    if (playing && cur) v.play().catch(() => setPlaying(false));
    else v.pause();
  }, [playing, cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const onTime = () => {
    const v = vref.current;
    if (!v || !cur || !playing) return;
    if (v.currentTime >= cur.outPoint - 0.03) {
      const end = cur.start + clipDur(cur);
      if (end >= total - 0.01) {
        setPlaying(false);
        setT(Math.max(0, total - 0.001));
      } else setT(end + 0.001);
    } else setT(cur.start + (v.currentTime - cur.inPoint));
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (newDecl === 'third_party') return setNote(m.blockedThird);
    if (f.size > DEFAULT_FREE.maxUploadMB * 1048576) return setNote(m.tooBig);
    const url = URL.createObjectURL(f);
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      const a: Asset = {
        id: uid('a'),
        name: f.name,
        url,
        duration: probe.duration,
        width: probe.videoWidth,
        height: probe.videoHeight,
      };
      setAssets((s) => ({ ...s, [a.id]: a }));
      setH((s) => commit(s, addClip(s.present, a.id, a.duration, newDecl)));
      setNote(m.loaded);
    };
    probe.onerror = () => setNote(m.loadFail);
    probe.src = url;
  };

  const doSplit = () => {
    if (!cur) return setNote(m.nothing);
    const n = splitClip(project, cur.id, t);
    if (!n) return setNote(m.cannotSplit);
    setH((s) => commit(s, n));
    setNote('');
  };

  const doDelete = () => {
    const target = selClip ?? cur;
    if (!target) return setNote(m.nothing);
    setH((s) => commit(s, deleteClip(s.present, target.id)));
    setSel(null);
    setT((x) => Math.min(x, Math.max(0, total - clipDur(target) - 0.001)));
  };

  const commitDraft = () => {
    if (!fxClip || !Object.keys(draft).length) return;
    const id = fxClip.id;
    const patch = draft;
    setH((s) => commit(s, updateClip(s.present, id, { effects: { ...s.present.clips[id].effects, ...patch } })));
    setDraft({});
  };

  const name = (clipId: string) => assets[project.clips[clipId]?.assetId]?.name ?? clipId;

  return (
    <div className="w">
      <header>
        <div className="logo">JH</div>
        <div>
          <h1>JH AI Creator</h1>
          <div className="mu">{m.sub}</div>
        </div>
        <div className="sp" />
        <button className="sm" onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')}>
          {lang === 'bn' ? 'EN' : 'বাংলা'}
        </button>
      </header>

      {note && <div className="msg">{note}</div>}
      {missing && <div className="msg">{m.missing}</div>}

      <div className="card">
        <div className="bar">
          <label className="sm pri" style={{ cursor: 'pointer' }}>
            {m.upload}
            <input type="file" accept="video/*" hidden onChange={onFile} />
          </label>
          <button className="sm" onClick={doSplit}>✂ {m.split}</button>
          <button className="sm" onClick={doDelete}>{m.del}</button>
          <button className="sm" disabled={!h.past.length} onClick={() => setH(undo)}>↶ {m.undo}</button>
          <button className="sm" disabled={!h.future.length} onClick={() => setH(redo)}>↷ {m.redo}</button>
          <button className="sm" disabled title={m.soon}>{m.generate}</button>
          <button className="sm" disabled title={m.soon}>{m.voice}</button>
        </div>
        <div className="pv" aria-label={m.preview}>
          <video
            ref={vref}
            playsInline
            onTimeUpdate={onTime}
            style={{
              filter: `brightness(${shown.brightness / 100}) contrast(${shown.contrast / 100}) saturate(${shown.saturation / 100})`,
              transform: `scale(${shown.zoom / 100})`,
              visibility: cur ? 'visible' : 'hidden',
            }}
          />
          {!cur && <div className="empty">{m.empty}</div>}
        </div>
        <div className="ctl">
          <button className="play" disabled={!total} onClick={() => setPlaying((p) => !p)}>
            {playing ? m.pause : m.play}
          </button>
          <span className="t">{fmt(t)} / {fmt(total)}</span>
        </div>
        <Timeline
          project={project}
          assets={assets}
          t={t}
          total={total}
          selected={sel}
          onSeek={(x) => setT(x)}
          onSelect={setSel}
        />
      </div>

      <div className="card">
        <h2>{m.color}</h2>
        {FX.map(({ key, min, max }) => (
          <div className="sl" key={key}>
            <span>{m.fx[key]}</span>
            <input
              type="range"
              min={min}
              max={max}
              value={fx[key]}
              disabled={!fxClip}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: Number(e.target.value) }))}
              onPointerUp={commitDraft}
              onKeyUp={commitDraft}
            />
            <span>{fx[key]}%</span>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>{m.source}</h2>
        <label className="l">{m.newClipSource}</label>
        <select value={newDecl} onChange={(e) => setNewDecl(e.target.value as SourceDeclaration)}>
          {DECLS.map((d) => <option key={d} value={d}>{m.decl[d]}</option>)}
        </select>
        {selClip && (
          <>
            <label className="l">{m.clipSource}: {name(selClip.id)}</label>
            <select
              value={selClip.declaration}
              onChange={(e) =>
                setH((s) => commit(s, updateClip(s.present, selClip.id, { declaration: e.target.value as SourceDeclaration })))
              }
            >
              {DECLS.map((d) => <option key={d} value={d}>{m.decl[d]}</option>)}
            </select>
            <label className="l">
              <input
                type="checkbox"
                checked={evidence.has(selClip.assetId)}
                onChange={(e) =>
                  setEvidence((s) => {
                    const n = new Set(s);
                    if (e.target.checked) n.add(selClip.assetId);
                    else n.delete(selClip.assetId);
                    return n;
                  })
                }
              />{' '}
              {m.evidence}
            </label>
          </>
        )}
      </div>

      <div className="card">
        <h2>{m.review}</h2>
        <div className={`res ${review.level}`}>
          <b>{m.level[review.level]}</b> · {m.levelText[review.level]}
          {review.findings.length > 0 && (
            <ul>
              {review.findings.map((f) => (
                <li key={f.clipId + f.reason}>
                  <span className={`b ${f.level}`}>{m.level[f.level]}</span> {name(f.clipId)}: {m.reasons[f.reason]}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="bar" style={{ marginTop: 10 }}>
          <button className="sm pri" disabled title={m.exportSoon}>{m.export}</button>
        </div>
        <div className="mu">{m.exportSoon}</div>
      </div>

      <div className="disc">{m.disclaimer}</div>
    </div>
  );
}
