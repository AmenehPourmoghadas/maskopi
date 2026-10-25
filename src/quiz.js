// Shape every quiz must have before it is shown or played:
// { title, questions: [{ q, answers: [2-4 strings], correct: index, time?: seconds }] }
// A question has no time limit unless "time" is given.
// Optional "music" is a track id from public/music/catalog.json, or "none".
const LIMITS = { questions: 50, answers: 4, title: 100, q: 200, a: 80 };

const text = (value, max) =>
  typeof value === "string" ? value.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "";

export function validateQuiz(input, musicIds = []) {
  if (!input || typeof input !== "object" || !Array.isArray(input.questions)) return null;
  const questions = [];
  for (const raw of input.questions.slice(0, LIMITS.questions)) {
    const q = text(raw?.q, LIMITS.q);
    const answers = Array.isArray(raw?.answers)
      ? raw.answers.slice(0, LIMITS.answers).map((a) => text(a, LIMITS.a))
      : [];
    const correct = Number(raw?.correct);
    if (!q || answers.length < 2 || answers.some((a) => !a)) return null;
    if (!Number.isInteger(correct) || correct < 0 || correct >= answers.length) return null;
    const item = { q, answers, correct };
    const seconds = Number(raw?.time);
    if (Number.isFinite(seconds) && seconds > 0) item.time = Math.min(120, Math.max(5, Math.round(seconds)));
    questions.push(item);
  }
  if (!questions.length) return null;
  const quiz = { title: text(input.title, LIMITS.title) || "Untitled quiz", questions };
  if (input.music === "none" || musicIds.includes(input.music)) quiz.music = input.music;
  return quiz;
}
