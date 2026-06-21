export type LogLevel = "info" | "warn" | "error" | "debug";

export function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const payload = {
    level,
    message,
    time: new Date().toISOString(),
    ...meta
  };

  const serialized = JSON.stringify(payload);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.log(serialized);
}
