import { spawn } from "node:child_process";

const children = [
  spawn(
    ".venv/bin/python",
    [
      "-m",
      "uvicorn",
      "engine.api:app",
      "--host",
      "127.0.0.1",
      "--port",
      "8000",
    ],
    { stdio: "inherit" },
  ),
  spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5173"],
    { stdio: "inherit", env: { ...process.env, CI: "true" } },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((c) => c.kill("SIGTERM"));
  setTimeout(() => process.exit(code), 400);
}
children.forEach((c) => {
  c.on("error", (e) => {
    console.error(e.message);
    stop(1);
  });
  c.on("exit", (code) => stop(code ?? 1));
});
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
