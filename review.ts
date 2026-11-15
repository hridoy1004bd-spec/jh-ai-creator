import type { Project, SourceDeclaration } from '@/features/editor/types';

export type Level = 'GREEN' | 'YELLOW' | 'RED';
export type ReasonCode = 'third_party' | 'unverified' | 'no_evidence';
export interface Finding {
  clipId: string;
  level: Level;
  reason: ReasonCode;
}

// NOTE: crop / speed / color / filter / cartoon edits NEVER change the result.
// Only the declared source and the stored evidence do.
const NEEDS_EVIDENCE: SourceDeclaration[] = ['licensed', 'public_domain'];

/**
 * Internal risk assessment, NOT a legal guarantee and NOT a promise of zero claims.
 * `evidence` holds assetIds that have license evidence on file.
 * Must be re-run on the server before a real export (client checks can be bypassed).
 */
export function reviewProject(p: Project, evidence: Set<string>) {
  const findings: Finding[] = [];
  for (const c of Object.values(p.clips)) {
    if (c.declaration === 'third_party') {
      findings.push({ clipId: c.id, level: 'RED', reason: 'third_party' });
    } else if (c.declaration === 'unverified') {
      findings.push({ clipId: c.id, level: 'YELLOW', reason: 'unverified' });
    } else if (NEEDS_EVIDENCE.includes(c.declaration) && !evidence.has(c.assetId)) {
      findings.push({ clipId: c.id, level: 'YELLOW', reason: 'no_evidence' });
    }
  }
  const level: Level = findings.some((f) => f.level === 'RED')
    ? 'RED'
    : findings.length
      ? 'YELLOW'
      : 'GREEN';
  return { level, findings, exportAllowed: level !== 'RED' };
}
