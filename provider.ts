// SERVER ONLY. Do not import from client components.
// Keys come from server environment variables, never from the browser.
// Phase 2: interface only. No provider is connected, so no AI feature may claim to work.

export type JobType =
  | 'text_to_video'
  | 'image_to_video'
  | 'cartoon'
  | 'bg_removal'
  | 'enhance'
  | 'storyboard'
  | 'script'
  | 'captions'
  | 'tts';

export interface AiJobRequest {
  type: JobType;
  prompt?: string;
  assetUrl?: string;
  options?: Record<string, unknown>;
}

export interface AiJobStatus {
  id: string;
  state: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  outputUrl?: string;
  error?: string;
}

export interface AiProvider {
  id: string;
  supports: JobType[];
  submit(req: AiJobRequest): Promise<{ externalId: string }>;
  poll(externalId: string): Promise<AiJobStatus>;
  cancel?(externalId: string): Promise<void>;
}

export const registry = new Map<string, AiProvider>();

export function getProvider(id: string, type: JobType): AiProvider {
  const p = registry.get(id);
  if (!p) throw new Error('AI provider not connected: ' + id);
  if (!p.supports.includes(type)) throw new Error(id + ' does not support ' + type);
  return p;
}
