import { startCompose, stopCompose } from "./compose-stack.ts";

export { startCompose, stopCompose };

export default async function setup(): Promise<() => Promise<void>> {
  await startCompose();
  return stopCompose;
}
