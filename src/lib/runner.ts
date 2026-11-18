import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { Job, Moment } from "./types.js";
import { messageSeconds, rankMoments } from "./scoring.js";
const fmt = (s: number) => new Date(s * 1000).toISOString().slice(11, 19);
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:");

function vodId(url: string) { const id = url.match(/videos\/(\d+)/)?.[1]; if (!id) throw new Error("Enter a Twitch VOD URL such as https://www.twitch.tv/videos/123"); return id; }
async function command(commandName: string, args: string[], write: (line: string) => void) {
  write(`Running: ${commandName} ${args.map((arg) => arg.includes(" ") ? JSON.stringify(arg) : arg).join(" ")}`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(commandName, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "", lastStatus = "";
    const receive = (chunk: Buffer) => {
      const text = chunk.toString(); output += text;
      for (const raw of text.split(/[\r\n]+/)) {
        const line = raw.trim();
        if (line && line !== lastStatus) { lastStatus = line; write(line); }
      }
    };
    child.stdout.on("data", receive); child.stderr.on("data", receive);
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`Command failed (${code ?? "unknown"}): ${output.slice(-4000)}`)));
  });
}
async function requireFile(file: string, label: string, write: (line: string) => void) {
  const size = (await fs.stat(file)).size;
  if (!size) throw new Error(`${label} completed without producing output: ${file}`);
  write(`${label} complete: ${(size / 1024 / 1024).toFixed(1)} MB`);
}
function ass(words: { start: number; end: number; word: string }[], credit: string, durationSeconds: number) {
  const chunks: { start: number; end: number; text: string }[] = [];
  for (let i = 0; i < words.length; i += 4) { const part = words.slice(i, i + 4); if (part.length) chunks.push({ start: part[0].start, end: part.at(-1)!.end + .15, text: part.map((w) => w.word).join(" ") }); }
  const time = (n: number) => `0:${String(Math.floor(n / 60)).padStart(2,"0")}:${(n % 60).toFixed(2).padStart(5,"0")}`;
  return `[Script Info]\nPlayResX: 1080\nPlayResY: 1920\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,OutlineColour,BackColour,Bold,Alignment,MarginL,MarginR,MarginV\nStyle: Caption,Arial,64,&H00FFFFFF,&H00111111,&H99000000,-1,2,70,70,285\nStyle: Credit,Arial,30,&H00FFFFFF,&H00111111,&H66000000,0,8,40,40,45\n[Events]\nFormat: Layer,Start,End,Style,Text\nDialogue: 0,0:00:00.00,${time(durationSeconds)},Credit,${esc(credit)}\n${chunks.map((c) => `Dialogue: 0,${time(c.start)},${time(c.end)},Caption,${esc(c.text.toUpperCase())}`).join("\n")}`;
}

export async function processJob(job: Job, update: (job: Job) => void) {
  const write = (line: string) => { job.log.push(`${new Date().toLocaleTimeString()} ${line}`); update(job); };
  try {
    job.status = "processing"; update(job); await fs.mkdir(job.outputDir, { recursive: true });
    const chat = path.join(job.outputDir, "chat.json"), tdl = process.env.TWITCH_DOWNLOADER || "TwitchDownloaderCLI", id = vodId(job.vodUrl);
    const chatCache = path.resolve("exports", ".chat-cache", `${id}.json`);
    const chatThreads = process.env.CHAT_DOWNLOAD_THREADS || "8";
    const cachedChat = await fs.stat(chat).then((entry) => entry.size > 0).catch(() => false);
    const reusableChat = cachedChat || await fs.stat(chatCache).then((entry) => entry.size > 0).catch(() => false);
    if (cachedChat) write("Reusing the previously downloaded chat archive.");
    else if (reusableChat) { await fs.copyFile(chatCache, chat); write("Reusing the cached chat archive for this VOD."); }
    else {
      write(`Downloading complete chat history with ${chatThreads} parallel threads…`);
      await command(tdl, ["chatdownload", "--id", id, "-o", chat, "--threads", chatThreads, "--log-level", "Status,Info,Warning,Error"], write);
    }
    await requireFile(chat, "Chat download", write);
    if (!reusableChat) { await fs.mkdir(path.dirname(chatCache), { recursive: true }); await fs.copyFile(chat, chatCache); }
    const clipDurationSeconds = job.clipDurationSeconds;
    const seconds = messageSeconds(JSON.parse(await fs.readFile(chat, "utf8"))); job.moments = rankMoments(seconds, { top: 5, bucket: 10, baseline: 300, before: clipDurationSeconds * 2 / 3, after: clipDurationSeconds / 3, gap: Math.max(90, clipDurationSeconds + 30) }); update(job);
    if (!job.moments.length) throw new Error("No chat messages were found in this VOD.");
    write(`Selected ${job.moments.length} chat moments: ${job.moments.map((m) => fmt(m.spikeSeconds)).join(", ")}`);
    await fs.writeFile(path.join(job.outputDir, "moments.json"), JSON.stringify(job.moments, null, 2));
    for (const moment of job.moments) await renderMoment(job, moment, tdl, id, write);
    const metadata = job.moments.map((m) => `## clip_${String(m.rank).padStart(2,"0")}\nTitle: ${job.streamTitle || "GTA 6"} moment from ${job.creatorName}\nDescription: Credit: ${job.creatorName} (${job.creatorHandle})\nSource: ${job.vodUrl}\n#GTA6 #GTA6Clips #Shorts\n`).join("\n");
    await fs.writeFile(path.join(job.outputDir, "youtube-metadata.md"), `# YouTube upload package\n\n${metadata}`);
    job.status = "ready"; write("Upload package is ready for review."); update(job);
  } catch (error) { job.status = "failed"; job.error = error instanceof Error ? error.message : String(error); write(`Failed: ${job.error}`); update(job); }
}
async function renderMoment(job: Job, moment: Moment, tdl: string, id: string, write: (s: string) => void) {
  const name = `clip_${String(moment.rank).padStart(2, "0")}`, raw = path.join(job.outputDir, `${name}.raw.mp4`), visual = path.join(job.outputDir, `${name}.visual.mp4`), final = path.join(job.outputDir, `${name}.mp4`), preview = path.join(job.outputDir, `${name}.jpg`), words = path.join(job.outputDir, `${name}.words.json`), subs = path.join(job.outputDir, `${name}.ass`);
  write(`Rendering ${name} (${fmt(moment.startSeconds)})…`);
  // A 16:10 foreground retains more of the landscape source than the earlier
  // 4:5 crop. The remainder is deliberately shown as the blurred background.
  const filter = "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:10[bg];[0:v]crop='min(iw,ih*16/10)':'min(ih,iw*10/16)':'(iw-ow)/2':'(ih-oh)/2',scale=1080:675[fg];[bg][fg]overlay=0:(H-h)/2[out]";
  const ffmpeg = process.env.FFMPEG_BIN || "ffmpeg";
  // TwitchDownloaderCLI 1.56+ uses --beginning/--ending, not --start/--end.
  const downloadQuality = job.quality === "1080p" ? "1080p60" : "720p60";
  write(`${name}: requesting ${downloadQuality} source from ${fmt(moment.startSeconds)} to ${fmt(moment.endSeconds)}`);
  await command(tdl, ["videodownload", "--id", id, "-o", raw, "--quality", downloadQuality, "--beginning", fmt(moment.startSeconds), "--ending", fmt(moment.endSeconds), "--trim-mode", "Exact", "--collision", "Overwrite", "--ffmpeg-path", ffmpeg, "--log-level", "Status,Info,Warning,Error"], write); await requireFile(raw, `${name} source download`, write);
  await command(ffmpeg, ["-y", "-hide_banner", "-loglevel", "warning", "-i", raw, "-filter_complex", filter, "-map", "[out]", "-map", "0:a?", "-t", String(job.clipDurationSeconds), "-c:v", "libx264", "-c:a", "aac", visual], write); await requireFile(visual, `${name} vertical render`, write);
  await command(process.env.PYTHON_BIN || "python3", ["scripts/transcribe.py", visual, words], write); await requireFile(words, `${name} caption transcript`, write);
  await fs.writeFile(subs, ass(JSON.parse(await fs.readFile(words, "utf8")), `@${job.creatorHandle.replace(/^@/, "")} · Twitch`, job.clipDurationSeconds));
  await command(ffmpeg, ["-y", "-hide_banner", "-loglevel", "warning", "-i", visual, "-vf", `ass=${subs}`, "-c:a", "copy", final], write); await requireFile(final, `${name} captioned video`, write);
  await command(ffmpeg, ["-y", "-hide_banner", "-loglevel", "warning", "-ss", "5", "-i", final, "-frames:v", "1", preview], write); await requireFile(preview, `${name} preview`, write);
  await fs.rm(raw, { force: true }); await fs.rm(visual, { force: true });
}
