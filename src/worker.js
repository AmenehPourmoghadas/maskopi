import { GameRoom } from "./game.js";
import { handleChat, handleVoice } from "./ai.js";
import { validateQuiz } from "./quiz.js";

export { GameRoom };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/chat" && request.method === "POST") return handleChat(request, env, await musicCatalog(env, url));
    if (path === "/api/voice" && request.method === "POST") return handleVoice(request, env);
    if (path === "/api/game" && request.method === "POST") return createGame(request, env, await musicCatalog(env, url));

    const socket = path.match(/^\/ws\/(\d{6})$/);
    if (socket) {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected a WebSocket", { status: 426 });
      }
      return env.GAME.get(env.GAME.idFromName(socket[1])).fetch(request);
    }

    // /join/123456 opens the player page with the PIN filled in.
    if (/^\/join\/\d{6}$/.test(path)) {
      return env.ASSETS.fetch(new Request(new URL("/", url), request));
    }

    return env.ASSETS.fetch(request);
  },
};

// The music library the host page shows is also what the AI may choose from.
let catalogCache = null;
async function musicCatalog(env, url) {
  if (catalogCache) return catalogCache;
  try {
    const res = await env.ASSETS.fetch(new Request(new URL("/music/catalog.json", url)));
    const list = await res.json();
    if (Array.isArray(list)) catalogCache = list;
    return list;
  } catch {
    return [];
  }
}

async function createGame(request, env, catalog) {
  const body = await request.json().catch(() => null);
  const quiz = validateQuiz(body?.quiz, catalog.map((t) => t.id));
  if (!quiz) return Response.json({ error: "That quiz is not valid." }, { status: 400 });

  // A PIN can collide with a game that is still running, so try a few.
  for (let attempt = 0; attempt < 5; attempt++) {
    const pin = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
    const room = env.GAME.get(env.GAME.idFromName(pin));
    const res = await room.fetch("https://game/init", {
      method: "POST",
      body: JSON.stringify({ pin, quiz }),
    });
    if (res.ok) return Response.json(await res.json());
  }
  return Response.json({ error: "Could not create a game. Please try again." }, { status: 503 });
}
