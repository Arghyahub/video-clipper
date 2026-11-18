import type { Moment } from "./types.js";

export function messageSeconds(payload: unknown): number[] {
  const root = payload as Record<string, unknown>;
  const messages = (Array.isArray(payload) ? payload : root.comments ?? root.messages ?? []) as Record<string, unknown>[];
  return messages.map((m) => Number(m.content_offset_seconds ?? m.contentOffsetSeconds ?? m.offset ?? m.timestamp ?? NaN)).filter(Number.isFinite);
}

export function rankMoments(seconds: number[], opts = { top: 5, bucket: 10, baseline: 300, before: 20, after: 10, gap: 90 }): Moment[] {
  if (!seconds.length) return [];
  // Twitch VOD chats can contain millions of messages. Spreading that array
  // into Math.max exceeds V8's argument limit, so find the maximum iteratively.
  let max = 0;
  for (const second of seconds) if (second > max) max = second;
  const count = Math.ceil((max + opts.bucket) / opts.bucket);
  const buckets = Array<number>(count).fill(0);
  seconds.forEach((s) => { if (s >= 0) buckets[Math.floor(s / opts.bucket)]++; });
  const radius = Math.floor(opts.baseline / opts.bucket / 2);
  const candidates = buckets.map((messages, i) => {
    const neighborhood = buckets.filter((_, j) => j !== i && j >= Math.max(0, i - radius) && j <= Math.min(count - 1, i + radius));
    const baseline = neighborhood.length ? neighborhood.reduce((a, b) => a + b, 0) / neighborhood.length : 0;
    return { spikeSeconds: i * opts.bucket, messages, baseline, multiplier: messages / Math.max(baseline, 0.1) };
  }).filter((x) => x.messages > 0).sort((a, b) => b.multiplier - a.multiplier || b.messages - a.messages);
  const selected: Moment[] = [];
  for (const candidate of candidates) {
    if (selected.some((m) => Math.abs(m.spikeSeconds - candidate.spikeSeconds) < opts.gap)) continue;
    selected.push({ rank: selected.length + 1, ...candidate, startSeconds: Math.max(0, candidate.spikeSeconds - opts.before), endSeconds: candidate.spikeSeconds + opts.after });
    if (selected.length === opts.top) break;
  }
  return selected;
}
