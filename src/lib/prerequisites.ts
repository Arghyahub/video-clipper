import { spawnSync } from "node:child_process";
export type Prerequisite = { name: string; available: boolean; detail: string };
export function checkPrerequisites(): Prerequisite[] {
  const python = process.env.PYTHON_BIN || "python3";
  const check = (name: string, command: string, args: string[] = ["--version"]): Prerequisite => {
    const result = spawnSync(command, args, { encoding: "utf8", shell: process.platform === "win32" });
    return { name, available: !result.error && result.status === 0, detail: result.error?.message ?? (result.stdout || result.stderr || "available").split("\n")[0] };
  };
  const twitchDownloader = check("TwitchDownloader", process.env.TWITCH_DOWNLOADER || "TwitchDownloaderCLI", ["--help"]);
  // TwitchDownloader's help command prints valid usage but exits 1 when no subcommand is supplied.
  if (!twitchDownloader.available && twitchDownloader.detail.includes("TwitchDownloaderCLI")) twitchDownloader.available = true;
  return [check("FFmpeg", process.env.FFMPEG_BIN || "ffmpeg", ["-version"]), check("Python", python, ["--version"]), check("faster-whisper", python, ["-c", "import faster_whisper"]), twitchDownloader];
}
