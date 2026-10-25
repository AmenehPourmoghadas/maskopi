// Keep AVATARS in sync with src/game.js.
const AVATARS = ["🦊", "🐼", "🐸", "🦁", "🐙", "🦄", "🐢", "🐧", "🐯", "🐨", "🐵", "🦖", "🐝", "🦉", "🐬", "🐞"];
const SHAPES = ["▲", "◆", "●", "■"];

const $ = (id) => document.getElementById(id);

function show(id) {
  document.querySelectorAll("main > section").forEach((s) => (s.hidden = s.id !== id));
}

function socketUrl(path) {
  return (location.protocol === "https:" ? "wss://" : "ws://") + location.host + path;
}

function answerButton(text, i) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "answer a" + i;
  const shape = document.createElement("span");
  shape.className = "shape";
  shape.textContent = SHAPES[i];
  const label = document.createElement("span");
  label.textContent = text;
  button.append(shape, label);
  return button;
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
