export type JobStatus = "queued" | "processing" | "ready" | "failed";
export type JobInput = { vodUrl: string; creatorName: string; creatorHandle: string; streamTitle?: string; quality: "720p" | "1080p"; clipDurationSeconds: 30 | 60; consent: boolean };
export type Moment = { rank: number; spikeSeconds: number; startSeconds: number; endSeconds: number; messages: number; baseline: number; multiplier: number };
export type Job = JobInput & { id: string; status: JobStatus; createdAt: string; error?: string; outputDir: string; moments: Moment[]; log: string[] };
