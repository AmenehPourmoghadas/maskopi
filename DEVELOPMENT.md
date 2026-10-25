# Developing Maskopi

Maskopi runs on Cloudflare Workers at `https://ai.maskopi.workers.dev`.

| Path | What it is |
|---|---|
| `public/` | The pages: `index.html` (kids join and play), `host.html` (AI chat and hosting) |
| `src/worker.js` | Routes requests: pages, `/api/chat`, `/api/game`, `/ws/<pin>` |
| `src/game.js` | One live game per PIN (Cloudflare Durable Object). Players are kept in memory only. |
| `src/ai.js` | The quiz assistant (Cloudflare Workers AI) with safety rules and a safety check |
| `wrangler.jsonc` | Cloudflare settings. `name` must stay `ai`. |

## Add background music

The music library is [public/music/catalog.json](public/music/catalog.json). The host page's music picker and the AI assistant both read it, so a new entry shows up in both automatically.

1. Download a free track you are allowed to use, for example from [Pixabay Music](https://pixabay.com/music/) (no credit needed), Incompetech (credit needed) or OpenGameArt (check each track's license).
2. Save the MP3 in `public/music/`, e.g. `public/music/happy-ukulele.mp3`. Keep files under about 3 MB so tablets load them quickly.
3. Add an entry to `catalog.json`:

```json
{
  "id": "ukulele",
  "name": "Happy ukulele",
  "emoji": "🌞",
  "moods": ["happy", "summer", "sunny", "kids"],
  "src": "/music/happy-ukulele.mp3",
  "source": "Pixabay",
  "url": "https://pixabay.com/music/...",
  "credit": ""
}
```

- `id`: short, lowercase, unique. Saved quizzes refer to it.
- `moods`: words the AI uses to pick the track for a request.
- `url`: the page you downloaded it from, as proof of the license.
- `credit`: the credit line, if the license requires one (e.g. Incompetech). It is shown under the picker when the track is selected.

Entries without `src` are the built-in tunes composed in [public/music.js](public/music.js).

## Run it on your computer

```bash
cd /c/Users/pourmoga/Documents/2023/Resume/Kahoot
npm install          # first time only
npx wrangler login   # first time only: the AI assistant needs your Cloudflare account
npm run dev
```

Then open:

- Teacher: <http://localhost:8787/host>
- Kids: <http://localhost:8787> in another browser tab or window

Use the **Sample quiz** button to test a game without the AI assistant.

The AI assistant uses your real Cloudflare Workers AI free allowance, even when running locally.

## Publish

Push to `main` on GitHub. Cloudflare builds and deploys automatically once the repository is connected to the `ai` Worker (Settings → Build).
