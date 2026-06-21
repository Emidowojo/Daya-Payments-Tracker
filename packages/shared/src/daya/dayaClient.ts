import crypto from "crypto";
import { AppConfig } from "../config";
import { FundingAccount } from "../types";

interface CreateFundingAccountInput {
  type: "TEMPORARY" | "PERMANENT";
  rail: "NGN_VIRTUAL_ACCOUNT" | "CRYPTO_ADDRESS";
  customer: {
    customer_id: string;
  };
  currency?: string;
  amount?: number;
  asset?: string;
  chain?: string;
  settlement_destination: Record<string, unknown>;
}

export class DayaClient {
  constructor(private readonly config: AppConfig) {}

  async createFundingAccount(input: CreateFundingAccountInput): Promise<FundingAccount> {
    if (this.config.dayaMockMode) {
      return this.mockFundingAccount(input);
    }

    if (!this.config.dayaApiKey) {
      throw new Error("DAYA_API_KEY is required when DAYA_MOCK_MODE=false");
    }

    const response = await fetch(`${this.config.dayaBaseUrl}/v1/funding-accounts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": this.config.dayaApiKey,
        "X-Idempotency-Key": `payment-tracker-${crypto.randomUUID()}`
      },
      body: JSON.stringify(input)
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(`Daya API error: ${response.status} ${JSON.stringify(payload)}`);
    }

    return payload as FundingAccount;
  }

  private mockFundingAccount(input: CreateFundingAccountInput): FundingAccount {
    const now = new Date().toISOString();
    const id = `fa_${crypto.randomUUID()}`;

    const instructions =
      input.rail === "NGN_VIRTUAL_ACCOUNT"
        ? [
            {
              type: "NGN_VIRTUAL_ACCOUNT",
              status: "ACTIVE",
              bank_name: "Wema Bank",
              bank_code: "035",
              account_number: "0690000031",
              account_name: "Daya Customer",
              currency: "NGN"
            }
          ]
        : [
            {
              type: "CRYPTO_ADDRESS",
              status: "ACTIVE",
              address: "0x742d35cc6634c0532925a3b844bc9e7595f2bd18",
              chain: input.chain ?? "BASE"
            }
          ];

    return {
      object: "funding_account",
      id,
      type: input.type,
      status: "ACTIVE",
      rail: input.rail,
      customer_id: input.customer.customer_id,
      currency: input.currency,
      amount: input.amount,
      asset: input.asset,
      chain: input.chain,
      settlement_destination: {
        type: input.settlement_destination.type as FundingAccount["settlement_destination"]["type"],
        ...input.settlement_destination
      },
      instructions,
      created_at: now,
      updated_at: now
    };
  }
}
