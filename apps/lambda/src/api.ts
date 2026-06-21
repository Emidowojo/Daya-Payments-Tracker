import { DayaClient } from "../../../packages/shared/src/daya/dayaClient";
import { processQueueBatch } from "../../../packages/shared/src/processor/webhookProcessor";
import { SqsQueue } from "../../../packages/shared/src/queue/sqsQueue";
import { generateWebhookSignature, verifyWebhookSignature } from "../../../packages/shared/src/signature";
import { DynamoJsonStore } from "../../../packages/shared/src/store/dynamoJsonStore";
import {
  createDepositEvent,
  fileResponse,
  FunctionUrlEvent,
  FunctionUrlResponse,
  getHeader,
  getMethod,
  getPath,
  getRawBody,
  getRuntimeConfig,
  jsonResponse,
  latestFundingAccount,
  parseJsonBody,
  resetEnabled,
  appActionsEnabled,
  TestPaymentInput
} from "./runtime";

interface FundingAccountRequest {
  customer_id?: string;
  amount?: number;
  asset?: "USDC" | "USDT";
  chain?: string;
}

const config = getRuntimeConfig();
const queue = new SqsQueue(config.sqsQueueUrl!, config.awsRegion);
const store = new DynamoJsonStore(config.stateTableName!, config.awsRegion);
const daya = new DayaClient(config);

export async function handler(event: FunctionUrlEvent): Promise<FunctionUrlResponse> {
  try {
    const method = getMethod(event);
    const path = getPath(event);

    if (method === "OPTIONS") return jsonResponse(200, { ok: true });

    if (method === "GET" && path === "/") return fileResponse("index.html", "text/html; charset=utf-8");
    if (method === "GET" && path === "/styles.css") return fileResponse("styles.css", "text/css; charset=utf-8");
    if (method === "GET" && path === "/app.js") return fileResponse("app.js", "text/javascript; charset=utf-8");

    if (method === "GET" && path === "/health") {
      return jsonResponse(200, {
        ok: true,
        service: "payment-tracker-api",
        deployment: "aws-lambda",
        daya_mock_mode: config.dayaMockMode
      });
    }

    if (method === "POST" && path === "/webhooks/daya") {
      const rawPayload = getRawBody(event);
      const signature = getHeader(event, "X-Daya-Signature");
      if (config.dayaRequireWebhookSignature && !verifyWebhookSignature(rawPayload, signature, config.dayaWebhookSecret)) {
        return jsonResponse(401, { error: "Invalid signature" });
      }

      await queue.enqueue(JSON.parse(rawPayload));
      return jsonResponse(200, { ok: true });
    }

    if (method === "GET" && path === "/records") {
      return jsonResponse(200, await store.getState());
    }

    if (!appActionsEnabled()) {
      return jsonResponse(404, { error: "Not found" });
    }

    if (method === "POST" && path === "/payment-accounts/bank") {
      const input = parseJsonBody<FundingAccountRequest>(event);
      if (!input.customer_id) return jsonResponse(400, { error: "customer_id is required" });

      const fundingAccount = await daya.createFundingAccount({
        type: "TEMPORARY",
        rail: "NGN_VIRTUAL_ACCOUNT",
        customer: {
          customer_id: input.customer_id
        },
        currency: "NGN",
        amount: input.amount ?? 50000,
        settlement_destination: {
          type: "INTERNAL_BALANCE"
        }
      });

      await store.upsertFundingAccount(fundingAccount);
      return jsonResponse(201, fundingAccount);
    }

    if (method === "POST" && path === "/payment-accounts/crypto") {
      const input = parseJsonBody<FundingAccountRequest>(event);
      if (!input.customer_id) return jsonResponse(400, { error: "customer_id is required" });

      const fundingAccount = await daya.createFundingAccount({
        type: "PERMANENT",
        rail: "CRYPTO_ADDRESS",
        customer: {
          customer_id: input.customer_id
        },
        asset: input.asset ?? "USDC",
        chain: input.chain ?? "BASE",
        settlement_destination: {
          type: "INTERNAL_BALANCE"
        }
      });

      await store.upsertFundingAccount(fundingAccount);
      return jsonResponse(201, fundingAccount);
    }

    if (method === "POST" && path === "/payments/test") {
      const input = parseJsonBody<TestPaymentInput>(event);
      const state = await store.getState();
      const fundingAccount =
        (input.funding_account_id ? state.funding_accounts[input.funding_account_id] : undefined) ??
        latestFundingAccount(state.funding_accounts);
      const simulatedEvent = createDepositEvent(input, fundingAccount);
      const payload = JSON.stringify(simulatedEvent);
      const signature = generateWebhookSignature(payload, config.dayaWebhookSecret);
      if (config.dayaRequireWebhookSignature && !verifyWebhookSignature(payload, signature, config.dayaWebhookSecret)) {
        return jsonResponse(500, { error: "Unable to sign test payment event" });
      }

      await queue.enqueue(simulatedEvent);
      return jsonResponse(202, {
        ok: true,
        event: simulatedEvent
      });
    }

    if (method === "POST" && path === "/payments/confirm") {
      return jsonResponse(200, await processQueueBatch(queue, store, config));
    }

    if (method === "POST" && path === "/records/clear") {
      if (!resetEnabled()) return jsonResponse(403, { error: "Clear is disabled on this deployed app" });
      await store.reset();
      await queue.reset?.();
      return jsonResponse(200, { ok: true });
    }

    return jsonResponse(404, { error: "Not found" });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
