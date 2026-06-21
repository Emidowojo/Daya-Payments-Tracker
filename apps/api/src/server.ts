import crypto from "crypto";
import express, { Request, Response } from "express";
import path from "path";
import { z } from "zod";
import { getConfig } from "../../../packages/shared/src/config";
import { DayaClient } from "../../../packages/shared/src/daya/dayaClient";
import { log } from "../../../packages/shared/src/logger";
import { processQueueBatch } from "../../../packages/shared/src/processor/webhookProcessor";
import { createQueue } from "../../../packages/shared/src/queue/createQueue";
import { generateWebhookSignature, verifyWebhookSignature } from "../../../packages/shared/src/signature";
import { createStore } from "../../../packages/shared/src/store/createStore";
import { AppState, DayaWebhookEvent, FundingAccount } from "../../../packages/shared/src/types";

const config = getConfig();
const app = express();
const queue = createQueue(config);
const store = createStore(config);
const daya = new DayaClient(config);

const ngnFundingAccountSchema = z.object({
  customer_id: z.string().min(1),
  amount: z.number().int().positive().default(50000)
});

const cryptoFundingAccountSchema = z.object({
  customer_id: z.string().min(1),
  asset: z.enum(["USDC", "USDT"]).default("USDC"),
  chain: z.string().min(1).default("BASE")
});

const simulateDepositSchema = z.object({
  funding_account_id: z.string().optional(),
  amount: z.union([z.string(), z.number()]).default("50000.00"),
  currency: z.string().optional(),
  asset: z.enum(["USDC", "USDT"]).optional(),
  chain: z.string().optional(),
  customer_id: z.string().optional()
});

async function acceptWebhookPayload(rawPayload: string, signature: string | undefined): Promise<DayaWebhookEvent> {
  if (config.dayaRequireWebhookSignature) {
    const verified = verifyWebhookSignature(rawPayload, signature, config.dayaWebhookSecret);
    if (!verified) {
      throw new Error("Invalid signature");
    }
  }

  const event = JSON.parse(rawPayload) as DayaWebhookEvent;
  await queue.enqueue(event);

  log("info", "Webhook accepted and enqueued", {
    webhook_event_id: event.id,
    event: event.event
  });

  return event;
}

function latestFundingAccount(state: AppState): FundingAccount | undefined {
  const accounts = Object.values(state.funding_accounts);
  return accounts.sort((left, right) => left.created_at.localeCompare(right.created_at)).at(-1);
}

function createDepositEvent(input: z.infer<typeof simulateDepositSchema>, fundingAccount?: FundingAccount): DayaWebhookEvent {
  const now = new Date().toISOString();
  const id = `dep_${crypto.randomUUID()}`;
  const amount = typeof input.amount === "number" ? input.amount.toFixed(2) : input.amount;
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

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: "payment-tracker-api",
    queue_mode: config.queueMode,
    daya_mock_mode: config.dayaMockMode
  });
});

app.post("/webhooks/daya", express.raw({ type: "application/json" }), async (req: Request, res: Response) => {
  try {
    const rawPayload = req.body.toString("utf8");
    const signature = req.header("X-Daya-Signature") ?? undefined;
    await acceptWebhookPayload(rawPayload, signature);
    return res.status(200).json({ ok: true });
  } catch (error) {
    log("error", "Failed to accept webhook", {
      error: error instanceof Error ? error.message : String(error)
    });
    const status = error instanceof Error && error.message === "Invalid signature" ? 401 : 400;
    return res.status(status).json({ error: error instanceof Error ? error.message : "Invalid webhook payload" });
  }
});

app.use(express.json());
app.use(express.static(path.resolve(process.cwd(), "apps/api/public")));

app.post("/payment-accounts/bank", async (req: Request, res: Response) => {
  try {
    const input = ngnFundingAccountSchema.parse(req.body);
    const fundingAccount = await daya.createFundingAccount({
      type: "TEMPORARY",
      rail: "NGN_VIRTUAL_ACCOUNT",
      customer: {
        customer_id: input.customer_id
      },
      currency: "NGN",
      amount: input.amount,
      settlement_destination: {
        type: "INTERNAL_BALANCE"
      }
    });

    await store.upsertFundingAccount(fundingAccount);
    res.status(201).json(fundingAccount);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post("/payment-accounts/crypto", async (req: Request, res: Response) => {
  try {
    const input = cryptoFundingAccountSchema.parse(req.body);
    const fundingAccount = await daya.createFundingAccount({
      type: "PERMANENT",
      rail: "CRYPTO_ADDRESS",
      customer: {
        customer_id: input.customer_id
      },
      asset: input.asset,
      chain: input.chain,
      settlement_destination: {
        type: "INTERNAL_BALANCE"
      }
    });

    await store.upsertFundingAccount(fundingAccount);
    res.status(201).json(fundingAccount);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/records", async (_req: Request, res: Response) => {
  res.json(await store.getState());
});

app.post("/payments/test", async (req: Request, res: Response) => {
  try {
    const input = simulateDepositSchema.parse(req.body);
    const state = await store.getState();
    const fundingAccount =
      (input.funding_account_id ? state.funding_accounts[input.funding_account_id] : undefined) ?? latestFundingAccount(state);
    const event = createDepositEvent(input, fundingAccount);
    const payload = JSON.stringify(event);
    const signature = generateWebhookSignature(payload, config.dayaWebhookSecret);
    await acceptWebhookPayload(payload, signature);

    res.status(202).json({
      ok: true,
      event,
      message: "Test payment queued"
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post("/payments/confirm", async (_req: Request, res: Response) => {
  const summary = await processQueueBatch(queue, store, config);
  res.json(summary);
});

app.post("/records/clear", async (_req: Request, res: Response) => {
  if (config.nodeEnv === "production") {
    return res.status(403).json({
      error: "Reset is disabled in production"
    });
  }

  await store.reset();
  await queue.reset?.();
  return res.json({ ok: true });
});

app.listen(config.port, () => {
  log("info", "API service listening", {
    port: config.port,
    queue_mode: config.queueMode,
    daya_mock_mode: config.dayaMockMode
  });
});
