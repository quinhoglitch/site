# Streamix

Streamix is a local streaming server (Node.js + Express) with a catalog-style web interface.
It reads your video library from disk, organizes it by series/season/episode, and plays content in the browser with progress tracking and external subtitles.

## Current status

- No ffmpeg/ffprobe dependency.
- Direct file streaming.
- `.srt` to `.vtt` subtitle conversion handled by the backend.

## Main features

- Automatic library indexing from folders.
- Search by series name.
- Series page with seasons and episodes.
- Player with:
  - progress saved in `localStorage`
  - previous/next episode buttons
  - next-episode autoplay
  - "Up Next" section
- External subtitle support (`.srt` and `.vtt`).
- Local network IP discovery for access from other devices.

## Tech stack

- Backend: Node.js, Express, CORS
- Frontend: HTML, CSS, Vanilla JavaScript

## Requirements

- Node.js 18+ (recommended)
- npm
- A local video library (default: `D:\`)

## Installation

```bash
npm install
```

## Run

```bash
npm start
```

Open:

- Local: `http://localhost:3000`
- Local network: use the network panel in the top-right UI or `GET /api/network`

## Available scripts

- `npm start`: starts the server
- `npm run dev`: same as start in the current setup

## Configuration

### Library folder

In `server.js`:

```js
const VIDEOS_DIR = 'D:\\animes';
```

Change it to the folder where your videos are stored.

## Expected folder structure

With seasons:

```text
D:\animes\
  Series A\
    poster.jpg
    Season 1\
      Episode 01.mp4
      Episode 02.mkv
      Episode 02.pt.srt
    Season 2\
      Episode 01.mp4
```

Without seasons (falls back to "Season 1" automatically):

```text
D:\animes\
  Series B\
    cover.png
    Part 1.mp4
    Part 1.srt
    Part 2.mp4
```

## Supported formats

### Video

- `.mp4`
- `.mkv`
- `.avi`
- `.mov`
- `.webm`
- `.m4v`

### Images (thumbnail/cover)

- `.jpg`
- `.jpeg`
- `.png`
- `.webp`

### External subtitles

- `.srt`
- `.vtt`

## Subtitle detection rules

For a video named `Episode 03.mkv`, the backend tries:

1. Exact match:
- `Episode 03.srt`
- `Episode 03.vtt`

2. Language suffix:
- `Episode 03.pt.srt`
- `Episode 03.en.vtt`
- `Episode 03.es.srt`

3. Fuzzy episode-number match:
- Example: matches `...03...mkv` with `03.srt` if names do not match exactly.

## Thumbnail detection rules

### Series

Lookup order (approximate):

- `poster.*`
- `thumbnail.*`
- `cover.*`
- `<series-name>.*`

### Episode

Lookup:

- `<video-file-name>.*`
- `thumbnail.*`
- `cover.*`
- `poster.*`

## API endpoints

### Library

- `GET /api/library`
  - Lists all series
  - Optional filter: `?q=text`

- `GET /api/series/:id`
  - Returns one series with seasons and episodes

- `POST /api/refresh`
  - Clears library cache

### Streaming

- `GET /api/video?file=<relative-path-or-/videos/...>`
  - Streams file content with `Range` support

### Subtitles

- `GET /api/srt2vtt?file=<relative-path-or-/videos/...>`
  - Converts `.srt` to WebVTT on the fly
  - If input is already `.vtt`, it is returned as-is

### Network and diagnostics

- `GET /api/network`
  - Returns local IPs and port

- `GET /api/debug/dir?path=<optional-subfolder>`
  - Lists directory files (diagnostic endpoint)

## Episode payload example

```json
{
  "id": "Series_A_Season_1_Episode_03.mkv",
  "title": "Episode 03",
  "episode": 3,
  "season": 1,
  "series": "Series A",
  "file": "/videos/Series A/Season 1/Episode 03.mkv",
  "thumbnail": "/videos/Series A/Season 1/Episode 03.jpg",
  "subtitles": [
    {
      "file": "/videos/Series A/Season 1/Episode 03.pt.srt",
      "lang": "pt",
      "label": "Portuguese",
      "ext": "srt"
    }
  ]
}
```

## Important limitations

- Without ffmpeg, playback depends on codecs supported by the browser.
  - Example: some `.mkv` files may load but fail to play audio/video.
- Frontend still tries internal subtitle endpoints (`/api/subtracks`), but these routes are currently removed and the app falls back silently.
- Backend uses synchronous disk I/O (`readdirSync`, `statSync`, `readFileSync`), which may impact performance on very large libraries.

## Troubleshooting

### Video does not play

1. Test with an H.264/AAC `.mp4` file.
2. Verify `VIDEOS_DIR` path in `server.js`.
3. Open `http://localhost:3000/api/library` and confirm episodes are listed.

### Subtitles do not show

1. Check subtitle file name and location (same folder as the video).
2. Test `GET /api/srt2vtt?file=...` directly in the browser.
3. Prefer UTF-8 subtitle files when possible.

### Library is empty

1. Confirm read permission for `VIDEOS_DIR`.
2. Use `GET /api/debug/dir` to verify backend file visibility.
3. Call `POST /api/refresh` to clear cache.

## Project structure

```text
streamix/
  public/
    css/style.css
    js/app.js
    index.html
  server.js
  package.json
```

## GitHub publishing notes

Suggested minimal `.gitignore`:

```gitignore
node_modules/
.env
npm-debug.log*
```

## License

ISC (as defined in `package.json`).

