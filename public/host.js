const STORE_KEY = "maskopi.quizzes";

let quiz = null;
let savedId = null;
let chat = [];
let game = null; // { pin, hostKey }
let ws = null;
let music = "playful"; // a catalog id, or "" for no music

// ---------- Quiz assistant ----------

function addMsg(role, text) {
  const div = document.createElement("div");
  div.className = "msg " + role;
  div.textContent = text;
  $("chat-log").append(div);
  $("chat-log").scrollTop = $("chat-log").scrollHeight;
  return div;
}

addMsg("assistant", "Hi! Tell me the topic and who the quiz is for (for example 8-year-olds, teenagers or a team of adults), and I'll make a quiz. You can type or tap 🎤 to speak, and ask me to change the quiz on the right.");

$("chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    $("chat-form").requestSubmit();
  }
});

$("chat-form").onsubmit = async (e) => {
  e.preventDefault();
  const text = $("chat-input").value.trim();
  if (!text) return;
  $("chat-input").value = "";
  addMsg("user", text);
  chat.push({ role: "user", content: text });
  $("chat-send").disabled = true;
  const thinking = addMsg("assistant", "Thinking… (a big quiz can take a minute or two)");

  const data = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: chat, quiz: quiz && currentQuiz() }),
  })
    .then((r) => r.json())
    .catch(() => ({ error: "Could not reach the assistant. Check your connection." }));

  thinking.remove();
  $("chat-send").disabled = false;
  if (data.error) {
    chat.pop();
    addMsg("error", data.error);
    return;
  }
  addMsg("assistant", data.reply);
  speak(data.reply);
  chat.push({ role: "assistant", content: data.reply });
  if (data.quiz) {
    setQuiz(data.quiz, savedId);
    addMsg("assistant", "Check the quiz on the right. Children see nothing until you press “Approve & host game”.");
  }
};

// ---------- Voice: speak to the assistant, hear its replies ----------

const READ_ALOUD_KEY = "maskopi.readAloud";
const MAX_RECORDING_MS = 30000;
let recording = false;
let recordingTimer = null;
let spokenLanguage = null; // language Whisper heard, used for the reply voice

$("mic").hidden = !Voice.supported;
$("read-aloud").closest("label").hidden = !window.speechSynthesis;
try {
  $("read-aloud").checked = localStorage.getItem(READ_ALOUD_KEY) === "1";
} catch {
  // Storage unavailable: default off.
}
$("read-aloud").onchange = () => {
  try {
    localStorage.setItem(READ_ALOUD_KEY, $("read-aloud").checked ? "1" : "0");
  } catch {
    // Not remembered, but still works for this visit.
  }
  if (!$("read-aloud").checked) window.speechSynthesis?.cancel();
};

function speak(text) {
  if (!$("read-aloud").checked || !window.speechSynthesis) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  if (spokenLanguage) utterance.lang = spokenLanguage;
  speechSynthesis.speak(utterance);
}

$("mic").onclick = async () => {
  if (!recording) {
    window.speechSynthesis?.cancel();
    try {
      await Voice.start();
    } catch {
      addMsg("error", "The microphone is blocked. Allow it in your browser settings, or type instead.");
      return;
    }
    recording = true;
    Music.setPaused(true);
    $("mic").textContent = "⏹";
    $("mic").classList.add("recording");
    $("mic").title = "Stop and send";
    recordingTimer = setTimeout(() => recording && $("mic").click(), MAX_RECORDING_MS);
    return;
  }

  clearTimeout(recordingTimer);
  recording = false;
  $("mic").classList.remove("recording");
  $("mic").textContent = "…";
  $("mic").disabled = true;
  const wav = await Voice.stop();
  Music.setPaused(false);

  const data = await fetch("/api/voice", { method: "POST", headers: { "content-type": "audio/wav" }, body: wav })
    .then((r) => r.json())
    .catch(() => ({ error: "Could not reach the assistant. Check your connection." }));
  $("mic").textContent = "🎤";
  $("mic").title = "Speak to the assistant";
  $("mic").disabled = false;
  if (data.error) return addMsg("error", data.error);
  if (!data.text) return addMsg("error", "I didn't catch that. Please try again.");
  spokenLanguage = data.language;
  $("chat-input").value = data.text;
  $("chat-form").requestSubmit();
};

// ---------- Quiz preview, music, save, import, export ----------

// The quiz plus the background music picked on the right-hand side.
function currentQuiz() {
  return { ...quiz, music: music || "none" };
}

let musicCatalog = [];

function selectMusic(id) {
  music = id;
  $("music-picker").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.id === id));
  const track = musicCatalog.find((t) => t.id === id);
  $("music-credit").textContent = track?.credit ? "Music: " + track.credit : "";
  Music.setTheme(id);
}

Music.catalog().then((list) => {
  musicCatalog = list;
  const options = [{ id: "", name: "Off", emoji: "🔇" }, ...list];
  $("music-picker").replaceChildren(
    ...options.map((t) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "music-option";
      b.dataset.id = t.id;
      const icon = document.createElement("span");
      icon.className = "music-emoji";
      icon.textContent = t.emoji || "🎵";
      const name = document.createElement("span");
      name.textContent = t.name;
      b.append(icon, name);
      b.onclick = () => selectMusic(t.id);
      return b;
    }),
  );
  selectMusic(music);
});

function setQuiz(q, id = null) {
  quiz = q;
  savedId = id;
  if (q.music) selectMusic(q.music === "none" ? "" : q.music);
  $("quiz-title").textContent = q.title;
  $("quiz-list").replaceChildren(
    ...q.questions.map((item) => {
      const li = document.createElement("li");
      const text = document.createElement("div");
      text.textContent = item.q + (item.time ? ` (⏱ ${item.time}s)` : "");
      const answers = document.createElement("div");
      answers.className = "ans";
      item.answers.forEach((a, i) => {
        const span = document.createElement("span");
        span.textContent = (i === item.correct ? "✓ " : "") + a;
        if (i === item.correct) span.className = "ok";
        answers.append(span, i < item.answers.length - 1 ? " · " : "");
      });
      li.append(text, answers);
      return li;
    }),
  );
  for (const id of ["start", "save", "export"]) $(id).disabled = false;
  $("setup-error").textContent = "";
}

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || [];
  } catch {
    return [];
  }
}

function storeSaved(list) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
    return true;
  } catch {
    $("setup-error").textContent = "Could not save in this browser. Use Export instead.";
    return false;
  }
}

function renderSaved() {
  const list = loadSaved();
  $("saved").replaceChildren(
    ...list.map((entry) => {
      const li = document.createElement("li");
      const open = document.createElement("button");
      open.className = "link";
      open.textContent = entry.quiz.title;
      open.onclick = () => {
        setQuiz(entry.quiz, entry.id);
        addMsg("assistant", `Opened “${entry.quiz.title}”. Tell me what to change.`);
      };
      const del = document.createElement("button");
      del.className = "link danger";
      del.textContent = "Delete";
      del.onclick = () => {
        if (!confirm(`Delete “${entry.quiz.title}”?`)) return;
        storeSaved(loadSaved().filter((x) => x.id !== entry.id));
        renderSaved();
      };
      li.append(open, del);
      return li;
    }),
  );
  if (!list.length) $("saved").innerHTML = '<li class="small">No saved quizzes yet.</li>';
}

$("save").onclick = () => {
  const list = loadSaved();
  const id = savedId || crypto.randomUUID();
  const entry = { id, savedAt: Date.now(), quiz: currentQuiz() };
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) list[i] = entry;
  else list.unshift(entry);
  if (storeSaved(list)) {
    savedId = id;
    renderSaved();
  }
};

$("export").onclick = () => {
  const blob = new Blob([JSON.stringify(currentQuiz(), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (quiz.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "quiz") + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
};

$("import").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.questions) || !data.questions.length) throw new Error();
    setQuiz({ title: data.title || file.name, questions: data.questions, music: data.music });
  } catch {
    $("setup-error").textContent = "That file isn't a Maskopi quiz.";
  }
};

$("sample").onclick = async () => setQuiz(await fetch("/sample-quiz.json").then((r) => r.json()));

renderSaved();

// ---------- Hosting the game ----------

$("start").onclick = async () => {
  $("start").disabled = true;
  const res = await fetch("/api/game", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ quiz: currentQuiz() }),
  }).catch(() => null);
  const data = res ? await res.json().catch(() => ({})) : { error: "Could not reach the server." };
  $("start").disabled = false;
  if (!data.pin) {
    $("setup-error").textContent = data.error || "Could not start the game.";
    return;
  }
  game = data;
  showLobby();
  connectHost();
};

function showLobby() {
  const url = `${location.origin}/join/${game.pin}`;
  $("join-host").textContent = location.host;
  $("pin-big").textContent = game.pin.slice(0, 3) + " " + game.pin.slice(3);
  $("qr").replaceChildren();
  if (window.qrcode) {
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    $("qr").innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2 });
  }
  $("players").replaceChildren();
  $("player-count").textContent = "Waiting for players…";
  $("begin").disabled = true;
  show("s-lobby");
}

function connectHost() {
  const sock = new WebSocket(socketUrl(`/ws/${game.pin}?role=host&key=${encodeURIComponent(game.hostKey)}`));
  ws = sock;
  sock.onmessage = (e) => handle(JSON.parse(e.data));
  sock.onclose = (e) => {
    if (sock !== ws || !game) return;
    if (e.code === 4001 || e.code === 4003) {
      alert("This game is no longer available.");
      resetToSetup();
      return;
    }
    setTimeout(() => sock === ws && connectHost(), 2000);
  };
}

const hostSend = (msg) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg));

$("begin").onclick = () => hostSend({ t: "start" });
$("end-game").onclick = () => confirm("End the game for everyone now?") && hostSend({ t: "end" });
$("again").onclick = resetToSetup;

function resetToSetup() {
  const old = ws;
  game = null;
  ws = null;
  old?.close();
  show("s-setup");
}

function handle(msg) {
  switch (msg.t) {
    case "lobby": {
      const online = msg.players.filter((p) => p.online).length;
      $("players").replaceChildren(
        ...msg.players.map((p) => {
          const chip = document.createElement("button");
          chip.className = "chip";
          chip.textContent = `${p.avatar} ${p.name}`;
          chip.onclick = () => confirm(`Remove ${p.name}?`) && hostSend({ t: "kick", id: p.id });
          return chip;
        }),
      );
      $("player-count").textContent = online ? `${online} player${online === 1 ? "" : "s"}` : "Waiting for players…";
      $("begin").disabled = online === 0;
      break;
    }
    case "progress": {
      const finished = msg.players.filter((p) => p.done).length;
      $("progress-summary").textContent = `${finished} of ${msg.players.length} finished`;
      $("progress-list").replaceChildren(
        ...msg.players.map((p) => {
          const step = p.done ? "✓ done" : `${p.index + 1} / ${msg.total}`;
          const li = leaderRow({ ...p, score: `${step} · ${p.score}` });
          if (!p.online) li.classList.add("offline");
          return li;
        }),
      );
      show("s-progress");
      break;
    }
    case "end":
      $("e-ranking").replaceChildren(
        ...msg.ranking.map((p, i) =>
          leaderRow({ ...p, name: (["🥇 ", "🥈 ", "🥉 "][i] || "") + p.name, score: `${p.correct}/${msg.total} · ${p.score}` }),
        ),
      );
      show("s-end");
      break;
  }
}

function leaderRow(p) {
  const li = document.createElement("li");
  const who = document.createElement("span");
  who.textContent = `${p.avatar} ${p.name}`;
  const score = document.createElement("span");
  score.textContent = p.score;
  li.append(who, score);
  return li;
}
