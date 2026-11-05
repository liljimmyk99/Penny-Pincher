import { compose } from "./stack";

/** Removes the stack and its volume, so every run starts from an empty database. */
export default async function globalTeardown() {
  if (process.env.E2E_SKIP_STACK === "1" || process.env.E2E_KEEP_STACK === "1") return;
  compose("down", "-v");
}
