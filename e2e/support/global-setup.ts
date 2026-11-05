import { compose } from "./stack";

/** Builds and starts the stack, waiting for every health check. */
export default async function globalSetup() {
  if (process.env.E2E_SKIP_STACK === "1") return; // stack already running (npm run stack:up)
  console.log("Starting the e2e stack (docker compose, project pp-e2e)…");
  compose("up", "-d", "--build", "--wait");
}
