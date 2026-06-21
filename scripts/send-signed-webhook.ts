import crypto from "crypto";
import { getConfig } from "../packages/shared/src/config";
import { generateWebhookSignature } from "../packages/shared/src/signature";
import { DayaWebhookEvent } from "../packages/shared/src/types";

const config = getConfig();

async function getFundingAccountId(): Promise<string> {
  try {
    const response = await fetch(`http://localhost:${config.port}/records`);
    const state = (await response.json()) as {
      funding_accounts?: Record<string, unknown>;
    };
    const firstFundingAccountId = Object.keys(state.funding_accounts ?? {})[0];
    return firstFundingAccountId ?? "fa_from_simulator";
  } catch {
    return "fa_from_simulator";
  }
}

async function main(): Promise<void> {
  const fundingAccountId = await getFundingAccountId();
  const now = new Date().toISOString();
  const event: DayaWebhookEvent = {
    id: `evt_${crypto.randomUUID()}`,
    event: "deposit.completed",
    timestamp: now,
    data: {
      id: `dep_${crypto.randomUUID()}`,
      type: "NGN_DEPOSIT",
      status: "COMPLETED",
      funding_account_id: fundingAccountId,
      customer_id: "customer_001",
      amount: "50000.00",
      currency: "NGN",
      settlement_status: "COMPLETED",
      settlement_mode: "INTERNAL_BALANCE",
      created_at: now,
      updated_at: now
    }
  };

  const payload = JSON.stringify(event);
  const signature = generateWebhookSignature(payload, config.dayaWebhookSecret);
  const response = await fetch(`http://localhost:${config.port}/webhooks/daya`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Daya-Signature": signature
    },
    body: payload
  });

  const responseBody = await response.text();
  console.log(response.status, responseBody);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
