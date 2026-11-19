# JW Music LangMix

A self-hosted editor that combines 2–10 language versions of the same song/video into one MP4 file. The interface is available in English at `/` and German at `/de/`. The repository contains application code and a language catalog. Song media is fetched on demand.

## Quick start with Docker

Install Docker with the Compose plugin, then run:

```sh
git clone https://github.com/1914jw/JW-Music-LangMix.git
cd JW-Music-LangMix
docker compose up --build -d
```

If you downloaded the project as a ZIP, extract it and run the last command from the folder containing `compose.yaml`. Docker installs Node.js, FFmpeg and the required font. The first build needs internet access.

Open [http://localhost:3000/](http://localhost:3000/) or [http://localhost:3000/de/](http://localhost:3000/de/) on the host.

## Run without Docker

Install Node.js 22+ and FFmpeg with `libx264`, AAC and `drawtext`. Make FFmpeg available on your PATH or set `FFMPEG_PATH`. From the project folder, run:

```sh
npm start
```

There are no npm package dependencies. To load settings from a local `.env` file, use `node --env-file=.env server/index.mjs`. Settings include `HOST`, `PORT`, `ACCESS_PASSWORD`, `FFMPEG_PATH`, `FONT_PATH` and `TEMP_ROOT`. Use a font that covers the language labels you plan to render.

## Hosting and GitHub Pages

GitHub hosts the source repository. To make the app available online, run the included Node.js service on your own host. GitHub Pages serves static files, while the app needs the Node.js service for metadata and media in both processing modes. Native FFmpeg on that host handles iPhone and iPad exports.

The supplied Compose configuration binds port 3000 to localhost. For remote access, put an HTTPS reverse proxy in front of it. Preserve the original Host header, forward all paths including `/api/` and `/vendor/`, and disable caching for media responses. A reverse proxy in a separate container can reach `music-langmix:3000` over a shared Docker network.

Copy `.env.example` to `.env` and set a strong `ACCESS_PASSWORD` before exposing the service. Basic Auth checks the password and accepts any username. Use it over HTTPS. Commit `.env.example` as the configuration template and keep your actual `.env` local. The included `.gitignore` also excludes `node_modules/` and `.DS_Store`.

## Create a mix

1. Copy the video's sharing link and paste it into the app. A valid audio sharing link is corrected to its video equivalent after validation.
2. Pick 2–10 languages. Search by name or code. Random selection puts the recognized browser language first and draws the other languages from a pool. 
3. Choose a quality and processing mode. The default is 720p. You can display the language name in the top-left corner.
4. Confirm the usage notice, prepare the mix, review the transitions and export.
5. Preview and download the MP4 file.

## Processing and alignment

FFmpeg cuts and encodes H.264/AAC video. Under automatic processing, desktop browsers use FFmpeg WebAssembly. iPhone and iPad use native FFmpeg on your server. The server delivers the finished MP4 with Faststart and byte-range support. Server jobs continue during tab suspension and can resume in the same tab after reload. Restarting the server ends active jobs.

The first selected version sets the timing reference. The app aligns instrumental audio, then estimates cut points using subtitle timecodes and audio energy. It favors cuts about two-thirds into longer pauses. A short audio crossfade softens each transition. Different arrangements or tempos can require manual adjustments to cut times and audio offsets. Review the output before sharing it.

Limits are 15 minutes per video, 350 MiB per source file and 450 MiB of source media per mix. The server processes one job at a time and can retain up to six jobs. Allow several GB of free temporary disk space. Lower-resolution sources may be scaled to the selected output size.

## Privacy and usage rights

Browser mode processes media locally after fetching it through your host. Server mode downloads the source media directly to temporary storage on your host and renders it there. The source provider can see your host's network address. The app stores the appearance preference locally and the temporary job ID in the current tab.

The server deletes inputs and intermediate files after a successful export. Results expire after about one hour. Canceling or starting a new mix deletes the corresponding server job. Treat job IDs as private because they grant access to results. If you operate a reverse proxy, you control its logs and backups.

You are responsible for permissions to download, edit and share media. See the [source terms of use](https://www.jw.org/en/terms-of-use/).

This project is unofficial and is not affiliated with, endorsed, sponsored, or specifically approved by jw.org.

## Source and tests

- `public/` contains the interface, translations, analysis and browser renderer.
- `server/` contains the HTTP service, media proxy and FFmpeg job handling.
- `public/languages.json` contains only `name` and `langcode` from the [language catalog](https://www.jw.org/en/languages/).
- `tests/` covers algorithms, HTTP routes and a synthetic MP4 export.

The browser renderer fetches `@ffmpeg/ffmpeg@0.12.15` and `@ffmpeg/core@0.12.10` from unpkg through your host. Native FFmpeg comes from the Docker image build or your host installation. See [FFmpeg licensing](https://ffmpeg.org/legal.html) and [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm).

Run `npm test` from the project folder. The native export test requires `ffmpeg` and `ffprobe`. The server export has been tested, while testing on a physical iPhone is still pending.

## Version 1.1.0 — language banners

Self-hosted deployment remains on `main`. This release does **not** add a
GitHub Pages deployment or a `web` branch. Browser rendering still relies on
this host for media, metadata and FFmpeg assets. An independent Pages edition
would need a separate local-file import workflow or verified cross-origin
provider access; copying `public/` to Pages does not work.

Both browser and server exports now support:

- Always-visible banners or a custom duration (0.1–900 seconds), restarting
  at the start of each language segment, including the first segment.
- Four corners or an explicit X/Y position.
- Custom JSON designs, with an example downloadable in the interface.
- Width, height and X/Y in a 1280 × 720 reference frame, scaled to output.
- A 16:9 placement preview. Long language names are clipped to the banner.

JSON accepts only `width`, `height`, `fontSize`, `padding`, `background`,
`color` and `opacity`. Colors must be six-digit hex values. Dimensions must
fit within the video; uploads are limited to 8 KB. No scripts, external URLs,
SVG markup or arbitrary FFmpeg filters are accepted. Designs are held in
memory; server processing receives the validated settings when exporting.
Browser and native font rendering can differ slightly by installed font.

Every output contains this gray footer during its final three seconds:

> Created with 1914jw/JW-Music-LangMix · Self-hosted

This attribution is independent of the language-banner toggle, has no disable
setting, and spans language cuts. It identifies the software, not ownership
or permission to use the underlying media. Source code remains editable;
it cannot prevent someone from modifying the renderer or editing the video.

### Verification

`npm test` includes settings validation and synthetic native video checks for
banner placement, timed hiding, and end credits crossing language boundaries,
including with language labels disabled. Native checks require FFmpeg and
ffprobe and are explicitly skipped when they are absent. GitHub Actions runs
these checks with FFmpeg installed. The synthetic browser export was also verified at 360p: timed banners hide,
restart, and the credit spans a cut. To repeat manually, temporarily copy
`tests/browser-export.html` to `public/qa.html`, open `/qa.html` on your running
local host and click its test button. Remove that temporary public copy after
testing. Physical iPhone/iPad testing remains pending.

See [deployment review](DEPLOYMENT-REVIEW.md) before public hosting.
