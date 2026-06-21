# Walkthrough Script

Use this when recording a walkthrough or presenting the project.

## Opening

This app shows how a business can use Daya to create payment details, receive payment notifications, and reconcile deposits, with AWS handling the reliable event-processing layer.

The product flow is simple:

1. Create payment details.
2. Receive a payment webhook when money arrives.
3. Verify the webhook signature.
4. Queue the event immediately.
5. Process the event with a worker.
6. Store the reconciled payment record.

## Local Walkthrough

Start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Then show:

1. The app starts with no payment accounts or deposits.
2. Create bank details.
3. Create a crypto address.
4. Send a test payment.
5. Point out that the payment event is received before it is confirmed.
6. Click `Confirm payment`.
7. Show the deposit in records.
8. Open the JSON panel and connect the fields to the Daya webhook payload.

## AWS Walkthrough

Start with the serverless architecture:

- Lambda Function URL for the app and webhook endpoint
- SQS for buffering webhook events
- Worker Lambda for processing events
- DynamoDB for payment records
- Secrets Manager for Daya credentials
- CloudWatch for logs and dead-letter queue alarm

Then mention the optional containers path:

- ECS Fargate for API and worker services
- Application Load Balancer for inbound webhook traffic
- Same SQS, DynamoDB, Secrets Manager, and CloudWatch backbone

## Key Teaching Points

- Daya creates the payment details and sends the webhook events.
- Webhook handlers should verify signatures.
- Webhook handlers should acknowledge quickly.
- Queueing protects the system from slow downstream work.
- Workers make retries and backpressure easier.
- Idempotency prevents duplicate webhook delivery from creating duplicate state.
- Funding Accounts are the current Daya Business API model for receiving NGN or stablecoins.
- Daya Pro is a separate trading API surface and should not be mixed into this architecture unless the product flow explicitly needs it.
