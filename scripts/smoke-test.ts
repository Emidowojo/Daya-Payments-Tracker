const apiUrl = process.env.API_URL ?? "http://localhost:3000";

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

async function main(): Promise<void> {
  await request("/health");
  await request("/records/clear", {
    method: "POST",
    body: "{}"
  });

  const fundingAccount = asRecord(
    await request("/payment-accounts/bank", {
      method: "POST",
      body: JSON.stringify({
        customer_id: "customer_smoke_001",
        amount: 50000
      })
    })
  );

  await request("/payments/test", {
    method: "POST",
    body: JSON.stringify({
      funding_account_id: fundingAccount.id,
      amount: "50000.00"
    })
  });

  const summary = asRecord(
    await request("/payments/confirm", {
      method: "POST",
      body: "{}"
    })
  );
  const state = asRecord(await request("/records"));
  const deposits = asRecord(state.deposits);
  const webhooks = asRecord(state.webhook_events);

  if (Object.keys(deposits).length !== 1) {
    throw new Error(`Expected 1 deposit, found ${Object.keys(deposits).length}`);
  }

  if (Object.keys(webhooks).length !== 1) {
    throw new Error(`Expected 1 webhook event, found ${Object.keys(webhooks).length}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        api_url: apiUrl,
        funding_account_id: fundingAccount.id,
        processed: summary.processed,
        deposits: Object.keys(deposits).length,
        webhook_events: Object.keys(webhooks).length
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
