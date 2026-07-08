import { getDb } from "./db";

export function isSampleDataEnabled(): boolean {
  const row = getDb()
    .prepare("SELECT value FROM meta WHERE key = 'sample_data'")
    .get() as { value?: string } | undefined;
  return row?.value === "1";
}
