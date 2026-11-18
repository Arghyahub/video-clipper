import "dotenv/config";
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { JobStore } from "./lib/store.js";
import { checkPrerequisites } from "./lib/prerequisites.js";
import { processJob } from "./lib/runner.js";
import type { Job, JobInput } from "./lib/types.js";

const app = express(), store = new JobStore();
const exec = promisify(execFile);
app.use(express.json()); app.use("/exports", express.static(path.resolve("exports")));
app.get("/api/health", (_, res) => res.json({ prerequisites: checkPrerequisites() }));
app.get("/api/jobs", (_, res) => res.json(store.list()));
app.get("/api/jobs/:id", (req, res) => { const job = store.get(req.params.id); job ? res.json(job) : res.sendStatus(404); });
app.get("/api/vod-info", async (req, res) => {
  const vodUrl = String(req.query.url ?? "");
  if (!/^https:\/\/www\.twitch\.tv\/videos\/\d+/.test(vodUrl)) return res.status(400).json({ error: "Enter a valid Twitch VOD URL." });
  try {
    const { stdout } = await exec(process.env.TWITCH_DOWNLOADER || "TwitchDownloaderCLI", ["info", "--id", vodUrl, "--format", "Raw", "--banner", "false"], { maxBuffer: 1024 * 1024, timeout: 30_000 });
    const firstJson = stdout.split("\n").find((line) => line.startsWith("{\"data\":{\"video\""));
    const video = firstJson && JSON.parse(firstJson).data?.video;
    if (!video?.owner?.login) throw new Error("The VOD did not return channel information.");
    res.json({ creatorName: video.owner.displayName, creatorHandle: `@${video.owner.login}`, streamTitle: video.title });
  } catch (error) { res.status(502).json({ error: error instanceof Error ? error.message : "Could not retrieve VOD information." }); }
});
app.post("/api/jobs", (req, res) => {
  const input = req.body as JobInput;
  if (!input.consent || !input.vodUrl || !input.creatorName || !input.creatorHandle) return res.status(400).json({ error: "VOD URL, creator details, and consent are required." });
  if (!/^https:\/\/www\.twitch\.tv\/videos\/\d+/.test(input.vodUrl)) return res.status(400).json({ error: "Enter a valid Twitch VOD URL." });
  if (input.quality && input.quality !== "720p" && input.quality !== "1080p") return res.status(400).json({ error: "Choose 720p or 1080p source quality." });
  if (input.clipDurationSeconds && input.clipDurationSeconds !== 30 && input.clipDurationSeconds !== 60) return res.status(400).json({ error: "Choose a 30 or 60 second clip duration." });
  const id = randomUUID(), job: Job = { ...input, quality: input.quality === "1080p" ? "1080p" : "720p", clipDurationSeconds: input.clipDurationSeconds === 30 ? 30 : 60, id, status: "queued", createdAt: new Date().toISOString(), outputDir: path.resolve("exports", id), moments: [], log: [] };
  store.save(job); void processJob(job, (next) => store.save(next)); res.status(202).json(job);
});
app.post("/api/jobs/:id/retry", (req, res) => {
  const job = store.get(req.params.id);
  if (!job) return res.sendStatus(404);
  if (job.status === "processing") return res.status(409).json({ error: "This job is already processing." });
  job.status = "queued"; delete job.error; job.moments = []; job.log.push(`${new Date().toLocaleTimeString()} Retrying job; existing chat data will be reused when available.`);
  store.save(job); void processJob(job, (next) => store.save(next)); res.status(202).json(job);
});
if (fs.existsSync(path.resolve("dist"))) { app.use(express.static(path.resolve("dist"))); app.get("*", (_, res) => res.sendFile(path.resolve("dist/index.html"))); }
app.listen(8787, () => console.log("Clip Studio API: http://localhost:8787"));
