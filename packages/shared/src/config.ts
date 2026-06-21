import dotenv from "dotenv";

dotenv.config();

export type QueueMode = "local" | "sqs";
export type StateBackend = "local" | "dynamodb";

export interface AppConfig {
  nodeEnv: string;
  port: number;
  dataDir: string;
  stateBackend: StateBackend;
  stateTableName?: string;
  queueMode: QueueMode;
  sqsQueueUrl?: string;
  awsRegion: string;
  dayaBaseUrl: string;
  dayaApiKey: string;
  dayaWebhookSecret: string;
  dayaRequireWebhookSignature: boolean;
  dayaMockMode: boolean;
  workerPollIntervalMs: number;
  workerBatchSize: number;
  workerOnce: boolean;
}

function boolFromEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function intFromEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getConfig(): AppConfig {
  const queueMode = (process.env.QUEUE_MODE ?? "local") as QueueMode;

  return {
    nodeEnv: process.env.NODE_ENV ?? "development",
    port: intFromEnv(process.env.PORT, 3000),
    dataDir: process.env.DATA_DIR ?? "./data",
    stateBackend: (process.env.STATE_BACKEND ?? "local") as StateBackend,
    stateTableName: process.env.STATE_TABLE_NAME,
    queueMode,
    sqsQueueUrl: process.env.SQS_QUEUE_URL,
    awsRegion: process.env.AWS_REGION ?? "us-east-1",
    dayaBaseUrl: process.env.DAYA_BASE_URL ?? "https://api.sandbox.daya.co",
    dayaApiKey: process.env.DAYA_API_KEY ?? "",
    dayaWebhookSecret: process.env.DAYA_WEBHOOK_SECRET ?? "dev_webhook_secret",
    dayaRequireWebhookSignature: boolFromEnv(process.env.DAYA_REQUIRE_WEBHOOK_SIGNATURE, true),
    dayaMockMode: boolFromEnv(process.env.DAYA_MOCK_MODE, true),
    workerPollIntervalMs: intFromEnv(process.env.WORKER_POLL_INTERVAL_MS, 3000),
    workerBatchSize: intFromEnv(process.env.WORKER_BATCH_SIZE, 10),
    workerOnce: boolFromEnv(process.env.WORKER_ONCE, false)
  };
}
