const STORE_KEY = "maskopi.quizzes";

let quiz = null;
let savedId = null;
let chat = [];
let game = null; // { pin, hostKey }
let ws = null;

// ---------- Quiz assistant ----------

function addMsg(role, text) {
  const div = document.createElement("div");
  div.className = "msg " + role;
  div.textContent = text;
  $("chat-log").append(div);
  $("chat-log").scrollTop = $("chat-log").scrollHeight;
  return div;
}

addMsg("assistant", "Hi! Tell me the topic and the children's age, and I'll make a quiz. You can also ask me to change the quiz on the right.");

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
  const thinking = addMsg("assistant", "Thinking…");

  const data = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: chat, quiz }),
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
  chat.push({ role: "assistant", content: data.reply });
  if (data.quiz) {
    setQuiz(data.quiz, savedId);
    addMsg("assistant", "Check the quiz on the right. Children see nothing until you press “Approve & host game”.");
  }
};

// ---------- Quiz preview, save, import, export ----------

function setQuiz(q, id = null) {
  quiz = q;
  savedId = id;
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
  const entry = { id, savedAt: Date.now(), quiz };
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) list[i] = entry;
  else list.unshift(entry);
  if (storeSaved(list)) {
    savedId = id;
    renderSaved();
  }
};

$("export").onclick = () => {
  const blob = new Blob([JSON.stringify(quiz, null, 2)], { type: "application/json" });
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
    setQuiz({ title: data.title || file.name, questions: data.questions });
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
    body: JSON.stringify({ quiz }),
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
