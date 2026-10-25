import { DurableObject } from "cloudflare:workers";

// Keep in sync with public/shared.js.
const AVATARS = ["🦊", "🐼", "🐸", "🦁", "🐙", "🦄", "🐢", "🐧", "🐯", "🐨", "🐵", "🦖", "🐝", "🦉", "🐬", "🐞"];
const MAX_PLAYERS = 100;
const GAME_TTL_MS = 3 * 60 * 60 * 1000;
const TIME_GRACE_MS = 2000; // allowance for slow networks on timed questions

// One GameRoom per PIN. The host waits in the lobby until everyone has joined,
// then starts the game. After that each player goes through the questions at
// their own pace, and the game ends when every connected player is finished.
//
// Players live only in memory: nothing about the children is written to
// storage, and the stored quiz is deleted when the game ends or after 3 hours.
export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.game = null;
    this.phase = "lobby"; // lobby -> playing -> ended
    this.host = null;
    this.players = new Map(); // player id -> player
    this.sockets = new Map(); // WebSocket -> player id
    ctx.blockConcurrencyWhile(async () => {
      this.game = (await ctx.storage.get("game")) ?? null;
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/init") return this.init(await request.json());

    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    if (url.searchParams.get("role") === "host") this.connectHost(server, url.searchParams.get("key"));
    else this.connectPlayer(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async init({ pin, quiz }) {
    if (this.game && this.phase !== "ended") return new Response("PIN in use", { status: 409 });
    this.game = { pin, quiz, hostKey: crypto.randomUUID() };
    this.phase = "lobby";
    this.players.clear();
    this.sockets.clear();
    await this.ctx.storage.put("game", this.game);
    await this.ctx.storage.setAlarm(Date.now() + GAME_TTL_MS);
    return Response.json({ pin, hostKey: this.game.hostKey });
  }

  async alarm() {
    for (const ws of [this.host, ...this.sockets.keys()]) ws?.close(4003, "Game expired");
    await this.ctx.storage.deleteAll();
    this.game = null;
  }

  get total() {
    return this.game.quiz.questions.length;
  }

  connectHost(ws, key) {
    if (!this.game || key !== this.game.hostKey) {
      ws.close(4001, "Not the host");
      return;
    }
    if (this.host) this.host.close(4000, "Host opened elsewhere");
    this.host = ws;
    ws.addEventListener("message", (e) => this.onHostMessage(e.data));
    ws.addEventListener("close", () => {
      if (this.host === ws) this.host = null;
    });
    this.update();
  }

  connectPlayer(ws) {
    ws.addEventListener("message", (e) => this.onPlayerMessage(ws, e.data));
    ws.addEventListener("close", () => this.onPlayerClose(ws));
  }

  onHostMessage(data) {
    const msg = parse(data);
    if (msg?.t === "start") this.start();
    else if (msg?.t === "kick") this.kick(msg.id);
    else if (msg?.t === "end") this.finish();
  }

  onPlayerMessage(ws, data) {
    const msg = parse(data);
    if (msg?.t === "join") this.join(ws, msg);
    else if (msg?.t === "answer") this.answer(ws, msg.index, msg.i, false);
    else if (msg?.t === "timeout") this.answer(ws, msg.index, null, true);
  }

  join(ws, msg) {
    if (!this.game) return fail(ws, "There is no game with that PIN.", true);
    if (this.phase === "ended") return fail(ws, "This game has ended.", true);
    if (this.players.size >= MAX_PLAYERS) return fail(ws, "This game is full.", true);
    if (this.sockets.has(ws)) return;
    const name = cleanName(msg.name);
    if (!name) return fail(ws, "Please type a nickname.");
    if (!AVATARS.includes(msg.avatar)) return fail(ws, "Please pick an avatar.");
    const taken = [...this.players.values()].some((p) => p.name.toLowerCase() === name.toLowerCase());
    if (taken) return fail(ws, "That nickname is taken. Try another one!");

    const player = { id: crypto.randomUUID(), name, avatar: msg.avatar, score: 0, correct: 0, index: 0, done: false, ws };
    this.players.set(player.id, player);
    this.sockets.set(ws, player.id);
    send(ws, { t: "joined", name, avatar: player.avatar });
    // Someone joining after the start begins at question 1 straight away.
    if (this.phase === "playing") this.sendQuestion(player);
    this.update();
  }

  onPlayerClose(ws) {
    const id = this.sockets.get(ws);
    this.sockets.delete(ws);
    const player = id && this.players.get(id);
    if (!player) return;
    // In the lobby a player who leaves is gone; mid-game they keep their score.
    if (this.phase === "lobby") this.players.delete(id);
    else player.ws = null;
    this.update();
  }

  kick(id) {
    const player = this.players.get(id);
    if (!player) return;
    if (player.ws) {
      send(player.ws, { t: "kicked" });
      this.sockets.delete(player.ws);
      player.ws.close(4002, "Removed by host");
    }
    this.players.delete(id);
    this.update();
  }

  start() {
    if (!this.game || this.phase !== "lobby") return;
    if (![...this.players.values()].some((p) => p.ws)) return;
    this.phase = "playing";
    for (const p of this.players.values()) this.sendQuestion(p);
    this.update();
  }

  sendQuestion(player) {
    const q = this.game.quiz.questions[player.index];
    player.questionStart = Date.now();
    send(player.ws, { t: "question", index: player.index, total: this.total, q: q.q, answers: q.answers, time: q.time ?? null });
  }

  // An answer moves the player straight on to their next question.
  answer(ws, index, i, timedOut) {
    const player = this.players.get(this.sockets.get(ws));
    if (!player || this.phase !== "playing" || player.done || index !== player.index) return;
    const q = this.game.quiz.questions[player.index];
    const elapsed = Date.now() - player.questionStart;

    if (timedOut) {
      if (!q.time || elapsed < q.time * 1000 - TIME_GRACE_MS) return;
    } else if (!Number.isInteger(i) || i < 0 || i >= q.answers.length) {
      return;
    }

    const late = q.time && elapsed > q.time * 1000 + TIME_GRACE_MS;
    if (!timedOut && !late && i === q.correct) {
      player.correct++;
      // Timed questions reward speed (500-1000 points); untimed ones give 1000.
      player.score += q.time ? Math.round(1000 * (1 - Math.min(elapsed / (q.time * 1000), 1) / 2)) : 1000;
    }

    player.index++;
    if (player.index < this.total) {
      this.sendQuestion(player);
    } else {
      player.done = true;
      send(ws, { t: "done", score: player.score, correct: player.correct, total: this.total });
    }
    this.update();
  }

  update() {
    if (!this.game) return;
    if (this.phase === "lobby") {
      send(this.host, {
        t: "lobby",
        players: [...this.players.values()].map(({ id, name, avatar, ws }) => ({ id, name, avatar, online: !!ws })),
      });
    } else if (this.phase === "playing") {
      send(this.host, {
        t: "progress",
        total: this.total,
        players: this.ranking().map((r) => {
          const p = this.players.get(r.id);
          return { ...r, index: p.index, done: p.done, online: !!p.ws };
        }),
      });
      const online = [...this.players.values()].filter((p) => p.ws);
      if (online.length && online.every((p) => p.done)) this.finish();
    }
  }

  async finish() {
    if (!this.game || this.phase === "ended") return;
    this.phase = "ended";
    const ranking = this.ranking();
    send(this.host, { t: "end", total: this.total, ranking });
    ranking.forEach((r, n) => {
      send(this.players.get(r.id).ws, { t: "end", rank: n + 1, score: r.score, correct: r.correct, total: this.total, podium: ranking.slice(0, 3) });
    });
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  ranking() {
    return [...this.players.values()]
      .sort((a, b) => b.score - a.score)
      .map(({ id, name, avatar, score, correct }) => ({ id, name, avatar, score, correct }));
  }
}

function send(ws, msg) {
  if (!ws) return;
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // The socket closed; its close handler cleans up.
  }
}

function fail(ws, message, fatal = false) {
  send(ws, { t: "error", message, fatal });
}

function parse(data) {
  if (typeof data !== "string" || data.length > 2000) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function cleanName(value) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 16) : "";
}
