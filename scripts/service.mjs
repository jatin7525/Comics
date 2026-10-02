import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const [service, command] = process.argv.slice(2);
const ports = { reader: 3100, studio: 3101, admin: 3102 };
if (
  !Object.hasOwn(ports, service) ||
  !["dev", "build", "start"].includes(command)
)
  throw new Error("Expected reader|studio|admin and dev|build|start.");
if (existsSync(resolve(root, ".env.local")))
  process.loadEnvFile(resolve(root, ".env.local"));
const port = ports[service];
const origin = process.env[`${service.toUpperCase()}_ORIGIN`];
const env = {
  ...process.env,
  ASTRA_SERVICE: service,
  APP_ORIGIN:
    origin ??
    (command === "start" ? process.env.APP_ORIGIN : `http://localhost:${port}`),
};
if (command === "start" && !origin)
  throw new Error(
    `Set ${service.toUpperCase()}_ORIGIN explicitly before starting a production service.`,
  );
const child = spawn(
  process.execPath,
  [
    resolve(root, "node_modules/next/dist/bin/next"),
    command,
    ...(command === "build"
      ? []
      : ["--hostname", "127.0.0.1", "--port", String(port)]),
  ],
  {
    cwd: service === "reader" ? root : resolve(root, "apps", service),
    env,
    stdio: "inherit",
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
