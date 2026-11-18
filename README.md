# GTA 6 Clip Studio

Local, permission-first Twitch VOD clip production. It detects chat spikes, renders vertical clips, adds local English captions, and creates a manual YouTube upload package.

## Linux setup

On a fresh Debian/Ubuntu, Fedora, Arch, or Alpine laptop, run the included bootstrapper from the project directory:

```bash
chmod +x bootstrap-linux.sh
./bootstrap-linux.sh
```

It installs Python tooling/fonts only when required, Node.js 22 (through nvm if needed), pnpm, a project-local `.venv` with `faster-whisper`, the current Linux TwitchDownloaderCLI release, and a project-local FFmpeg when your system does not already provide one. It also writes `.env` with absolute tool paths. The script may ask for your Linux administrator password only when basic Python, curl, or unzip tooling is absent.

For a manual setup, install Node 20+, FFmpeg, Python 3 with venv support, `curl`, `unzip`, and `fontconfig`; then install `faster-whisper` in `.venv`, download TwitchDownloaderCLI, set `TWITCH_DOWNLOADER` and `PYTHON_BIN` in `.env`, and run `pnpm install`.

## Run and use

```bash
pnpm dev
```

Open http://localhost:5173. The prerequisite indicators must be green before creating a job.

1. Paste an approved Twitch VOD URL and enter the creator name and handle.
2. Confirm you have permission to reuse the footage, then choose **Create five clips**.
3. Watch the job log. The app downloads chat, ranks chat spikes, downloads five selected segments, renders 1080×1920 clips, transcribes English speech locally, and creates previews.

### Chat-download speed

The first run for a VOD downloads and enriches its complete chat archive, which can take several minutes for a busy stream. The archive is then cached under `exports/.chat-cache`, so changing duration, resolution, or framing and running the same VOD again skips that step. New VODs use eight parallel TwitchDownloader threads by default. To lower or raise that (raising it can cause Twitch rate limiting), set `CHAT_DOWNLOAD_THREADS=4` or another value in `.env` before starting the dashboard.
4. Review the MP4s and `youtube-metadata.md` in the completed job. Upload manually in YouTube Studio after checking captions, framing, titles, and source credit.

Exports live in `exports/<job-id>/`; app data lives in `data/`. YouTube publishing is intentionally not implemented. Only process VODs for which you have creator permission or a campaign right to republish.
