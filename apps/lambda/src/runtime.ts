import crypto from "crypto";
import fs from "fs";
import path from "path";
import { AppConfig } from "../../../packages/shared/src/config";
import { DayaWebhookEvent, FundingAccount } from "../../../packages/shared/src/types";

export interface FunctionUrlEvent {
  rawPath?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
  isBase64Encoded?: boolean;
  requestContext?: {
    http?: {
      method?: string;
    };
  };
}

export interface FunctionUrlResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface SqsEvent {
  Records: Array<{
    messageId: string;
    body: string;
  }>;
}

export interface SqsBatchResponse {
  batchItemFailures: Array<{
    itemIdentifier: string;
  }>;
}

export interface TestPaymentInput {
  funding_account_id?: string;
  amount?: string | number;
  currency?: string;
  asset?: "USDC" | "USDT";
  chain?: string;
  customer_id?: string;
}

export function getRuntimeConfig(): AppConfig {
  return {
    nodeEnv: process.env.NODE_ENV ?? "production",
    port: 3000,
    dataDir: "/tmp/data",
    stateBackend: "dynamodb",
    stateTableName: requiredEnv("STATE_TABLE_NAME"),
    queueMode: "sqs",
    sqsQueueUrl: requiredEnv("SQS_QUEUE_URL"),
    awsRegion: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1",
    dayaBaseUrl: process.env.DAYA_BASE_URL ?? "https://api.sandbox.daya.co",
    dayaApiKey: process.env.DAYA_API_KEY ?? "",
    dayaWebhookSecret: process.env.DAYA_WEBHOOK_SECRET ?? "",
    dayaRequireWebhookSignature: boolFromEnv(process.env.DAYA_REQUIRE_WEBHOOK_SIGNATURE, true),
    dayaMockMode: boolFromEnv(process.env.DAYA_MOCK_MODE, false),
    workerPollIntervalMs: 0,
    workerBatchSize: 10,
    workerOnce: true
  };
}

export function getMethod(event: FunctionUrlEvent): string {
  return event.requestContext?.http?.method?.toUpperCase() ?? "GET";
}

export function getPath(event: FunctionUrlEvent): string {
  return event.rawPath ?? "/";
}

export function getRawBody(event: FunctionUrlEvent): string {
  const body = event.body ?? "";
  return event.isBase64Encoded ? Buffer.from(body, "base64").toString("utf8") : body;
}

export function getHeader(event: FunctionUrlEvent, headerName: string): string | undefined {
  const target = headerName.toLowerCase();
  const match = Object.entries(event.headers ?? {}).find(([key]) => key.toLowerCase() === target);
  return match?.[1];
}

export function jsonResponse(statusCode: number, payload: unknown): FunctionUrlResponse {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,X-Daya-Signature",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
    },
    body: JSON.stringify(payload)
  };
}

export function fileResponse(fileName: string, contentType: string): FunctionUrlResponse {
  const filePath = path.resolve(process.cwd(), "apps/api/public", fileName);
  return {
    statusCode: 200,
    headers: {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*"
    },
    body: fs.readFileSync(filePath, "utf8")
  };
}

export function parseJsonBody<T>(event: FunctionUrlEvent): T {
  const rawBody = getRawBody(event);
  return rawBody ? (JSON.parse(rawBody) as T) : ({} as T);
}

export function createDepositEvent(input: TestPaymentInput, fundingAccount?: FundingAccount): DayaWebhookEvent {
  const now = new Date().toISOString();
  const id = `dep_${crypto.randomUUID()}`;
  const amount =
    typeof input.amount === "number"
      ? input.amount.toFixed(2)
      : (input.amount ?? (fundingAccount?.rail === "CRYPTO_ADDRESS" ? "250.00" : "50000.00"));
  const rail = fundingAccount?.rail ?? "NGN_VIRTUAL_ACCOUNT";

  const data =
    rail === "CRYPTO_ADDRESS"
      ? {
          id,
          type: "CRYPTO_DEPOSIT",
          status: "COMPLETED",
          funding_account_id: input.funding_account_id ?? fundingAccount?.id ?? "fa_from_payment_tracker",
          customer_id: input.customer_id ?? fundingAccount?.customer_id ?? "customer_001",
          amount,
          asset: input.asset ?? fundingAccount?.asset ?? "USDC",
          chain: input.chain ?? fundingAccount?.chain ?? "BASE",
          tx_hash: `0x${crypto.randomBytes(32).toString("hex")}`,
          settlement_status: "COMPLETED",
          settlement_mode: fundingAccount?.settlement_destination.type ?? "INTERNAL_BALANCE",
          created_at: now,
          updated_at: now
        }
      : {
          id,
          type: "NGN_DEPOSIT",
          status: "COMPLETED",
          funding_account_id: input.funding_account_id ?? fundingAccount?.id ?? "fa_from_payment_tracker",
          customer_id: input.customer_id ?? fundingAccount?.customer_id ?? "customer_001",
          amount,
          currency: input.currency ?? fundingAccount?.currency ?? "NGN",
          settlement_status: "COMPLETED",
          settlement_mode: fundingAccount?.settlement_destination.type ?? "INTERNAL_BALANCE",
          created_at: now,
          updated_at: now
        };

  return {
    id: `evt_${crypto.randomUUID()}`,
    event: "deposit.completed",
    timestamp: now,
    data
  };
}

export function latestFundingAccount(accounts: Record<string, FundingAccount>): FundingAccount | undefined {
  return Object.values(accounts)
    .sort((left, right) => left.created_at.localeCompare(right.created_at))
    .at(-1);
}

export function appActionsEnabled(): boolean {
  return boolFromEnv(process.env.ALLOW_APP_ACTIONS, true);
}

export function resetEnabled(): boolean {
  return boolFromEnv(process.env.ALLOW_RESET, false);
}

function boolFromEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
