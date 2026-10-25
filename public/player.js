let pin = (location.pathname.match(/^\/join\/(\d{6})$/) || [])[1] || "";
let avatar = null;
let ws = null;
let countdown = null;

for (const a of AVATARS) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "avatar";
  b.textContent = a;
  b.onclick = () => {
    avatar = a;
    document.querySelectorAll(".avatar").forEach((x) => x.classList.toggle("picked", x === b));
  };
  $("avatars").append(b);
}

if (pin) show("s-profile");

$("pin-form").onsubmit = (e) => {
  e.preventDefault();
  const value = $("pin").value.replace(/\D/g, "");
  if (value.length !== 6) {
    $("pin-error").textContent = "A game PIN has 6 digits.";
    return;
  }
  pin = value;
  $("pin-error").textContent = "";
  show("s-profile");
};

$("profile-form").onsubmit = (e) => {
  e.preventDefault();
  if (!avatar) {
    $("profile-error").textContent = "Pick an avatar!";
    return;
  }
  $("profile-error").textContent = "";
  connect();
};

function connect() {
  ws?.close();
  const sock = new WebSocket(socketUrl("/ws/" + pin));
  ws = sock;
  sock.onopen = () => sock.send(JSON.stringify({ t: "join", name: $("name").value, avatar }));
  sock.onmessage = (e) => handle(JSON.parse(e.data));
  sock.onclose = () => {
    if (sock !== ws || !$("s-end").hidden) return;
    backToPin("Connection lost. Please join again.");
  };
}

function backToPin(message) {
  ws = null;
  Music.setTheme(null);
  $("pin-error").textContent = message;
  show("s-pin");
}

function handle(msg) {
  switch (msg.t) {
    case "error":
      if (msg.fatal) backToPin(msg.message);
      else $("profile-error").textContent = msg.message;
      break;
    case "joined":
      Music.setTheme(msg.music);
      $("me-avatar").textContent = msg.avatar;
      $("me-name").textContent = msg.name;
      show("s-wait");
      break;
    case "question":
      showQuestion(msg);
      break;
    case "done":
      clearInterval(countdown);
      $("d-score").textContent = `${msg.score} points`;
      $("d-correct").textContent = `${msg.correct} of ${msg.total} correct`;
      show("s-done");
      break;
    case "end":
      clearInterval(countdown);
      $("e-title").textContent = msg.rank === 1 ? "🏆 You won!" : msg.rank <= 3 ? `🥳 Place ${msg.rank}!` : `Place ${msg.rank}`;
      $("e-score").textContent = `${msg.score} points · ${msg.correct} of ${msg.total} correct`;
      $("e-podium").replaceChildren(...msg.podium.map(leaderRow));
      show("s-end");
      break;
    case "kicked":
      backToPin("The host removed you from the game.");
      break;
  }
}

// Tapping an answer sends it, and the server replies with the next question.
function showQuestion(msg) {
  clearInterval(countdown);
  const sendOnce = (payload) => {
    clearInterval(countdown);
    $("q-answers").querySelectorAll("button").forEach((b) => (b.disabled = true));
    ws?.send(JSON.stringify({ ...payload, index: msg.index }));
  };

  $("q-num").textContent = `${msg.index + 1} / ${msg.total}`;
  $("q-text").textContent = msg.q;
  $("q-answers").replaceChildren(
    ...msg.answers.map((text, i) => {
      const b = answerButton(text, i);
      b.onclick = () => sendOnce({ t: "answer", i });
      return b;
    }),
  );

  $("q-timer").textContent = "";
  if (msg.time) {
    const end = Date.now() + msg.time * 1000;
    const tick = () => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      $("q-timer").textContent = left;
      if (!left) sendOnce({ t: "timeout" });
    };
    tick();
    countdown = setInterval(tick, 250);
  }
  show("s-question");
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
