import { spawn } from "node:child_process";
import { startCompose } from "./compose-stack.ts";

const port = "4173";

await startCompose();

const server = spawn(
  "pnpm",
  ["run", "dev", "--host", "127.0.0.1", "--port", port, "--strictPort"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: port,
    },
  },
);

const stopServer = (signal: NodeJS.Signals) => {
  server.kill(signal);
};

process.on("SIGINT", () => stopServer("SIGINT"));
process.on("SIGTERM", () => stopServer("SIGTERM"));

server.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
