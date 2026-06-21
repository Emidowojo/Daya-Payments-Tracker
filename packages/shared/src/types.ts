export type FundingRail = "NGN_VIRTUAL_ACCOUNT" | "CRYPTO_ADDRESS";
export type FundingAccountType = "TEMPORARY" | "PERMANENT";
export type SettlementDestinationType = "INTERNAL_BALANCE" | "ONCHAIN" | "NGN_PAYOUT";

export interface DayaWebhookEvent<TData = Record<string, unknown>> {
  id: string;
  event: string;
  data: TData;
  timestamp: string;
}

export interface FundingAccount {
  object: "funding_account";
  id: string;
  type: FundingAccountType;
  status: "PENDING" | "ACTIVE" | "FAILED" | "DISABLED";
  rail: FundingRail;
  customer_id: string;
  currency?: string;
  amount?: number;
  asset?: string;
  chain?: string;
  settlement_destination: {
    type: SettlementDestinationType;
    [key: string]: unknown;
  };
  instructions: Array<Record<string, unknown>>;
  created_at: string;
  updated_at: string;
}

export interface Deposit {
  id: string;
  type?: string;
  status: string;
  funding_account_id?: string;
  customer_id?: string;
  amount?: string;
  currency?: string;
  asset?: string;
  chain?: string;
  tx_hash?: string;
  settlement_status?: string;
  settlement_mode?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface Transfer {
  id: string;
  status: string;
  rail?: string;
  amount?: string;
  currency?: string;
  reference?: string;
  [key: string]: unknown;
}

export interface Withdrawal {
  id: string;
  status: string;
  amount?: string;
  currency?: string;
  tx_hash?: string;
  [key: string]: unknown;
}

export interface WebhookEventRecord {
  id: string;
  event: string;
  status: "received" | "processed" | "failed" | "skipped_duplicate";
  received_at: string;
  processed_at?: string;
  attempts: number;
  last_error?: string;
  payload: DayaWebhookEvent;
}

export interface AppState {
  funding_accounts: Record<string, FundingAccount>;
  deposits: Record<string, Deposit>;
  transfers: Record<string, Transfer>;
  withdrawals: Record<string, Withdrawal>;
  webhook_events: Record<string, WebhookEventRecord>;
}

export interface QueueMessage {
  id: string;
  body: DayaWebhookEvent;
  receiptHandle?: string;
}
