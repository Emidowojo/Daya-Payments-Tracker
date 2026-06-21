# AWS Deployment Guide

This guide gives you two deployment paths for the Daya Payment Tracker.

Use the serverless path first if you want something affordable and easy to publish. Use the containers path when you specifically want to show ECS Fargate.

## Prerequisites

- Node.js 20 or newer
- AWS CLI configured with an AWS account
- AWS CDK bootstrap completed for your target account and region
- Daya sandbox API key, only if you want private real-sandbox testing
- Daya webhook signing secret, only if you want private real-sandbox testing
- Docker only if you choose the ECS containers path

## Option A: Serverless Deployment

This is the recommended path for a public walkthrough because it avoids a VPC, NAT gateways, an Application Load Balancer, and always-on Fargate tasks.

By default, this stack deploys with `DAYA_MOCK_MODE=true`. That makes the public app safe to share because it does not expose a live Daya sandbox API key behind unauthenticated buttons.

The stack creates:

- Lambda Function URL for the app and webhook endpoint
- Worker Lambda for background processing
- SQS webhook queue
- SQS dead-letter queue
- DynamoDB state table
- Secrets Manager secrets
- CloudWatch logs
- CloudWatch alarm for dead-letter queue messages

### 1. Install and Synthesize

```bash
npm install
npm run cdk:serverless:synth
```

### 2. Deploy

```bash
npm run cdk:serverless:deploy
```

After deploy, copy these outputs:

- `ApiUrl`
- `DayaWebhookUrl`
- `DayaApiKeySecretName`
- `DayaWebhookSecretName`
- `WebhookQueueUrl`
- `WebhookDeadLetterQueueUrl`

### 3. Optional: Connect a Private Daya Sandbox

Skip this section for a public article link. Use it only when you want to test privately against Daya sandbox.

First, set `DAYA_MOCK_MODE` to `false` in `infra/serverless-app.ts`, then replace the generated secret values with your Daya sandbox values.

```bash
aws secretsmanager put-secret-value \
  --secret-id <DayaApiKeySecretName> \
  --secret-string "<DAYA_SANDBOX_API_KEY>"
```

```bash
aws secretsmanager put-secret-value \
  --secret-id <DayaWebhookSecretName> \
  --secret-string "<DAYA_WEBHOOK_SECRET>"
```

The Lambda functions read these values through CloudFormation dynamic references. After changing the secret values, run the deploy command again so Lambda receives the current values.

```bash
npm run cdk:serverless:deploy
```

### 4. Optional: Configure Daya Webhook URL

If you enabled real sandbox mode, use the `DayaWebhookUrl` stack output as your Daya sandbox webhook endpoint.

It will look like this:

```text
https://<lambda-function-url>/webhooks/daya
```

### 5. Verify

Check API health:

```bash
curl <ApiUrl>/health
```

Open the app:

```text
<ApiUrl>
```

Then create payment details, send a test payment, confirm the payment, and inspect the records.

### 6. Clean Up

Do this after recording or testing so you do not leave resources running.

```bash
cdk destroy --app "node dist/infra/serverless-app.js"
```

## Option B: Containers Deployment

Use this path if you want the AWS article to focus more directly on containers.

The stack creates:

- VPC
- ECS cluster
- Public Application Load Balancer
- API Fargate service
- Worker Fargate service
- SQS webhook queue
- SQS dead-letter queue
- DynamoDB state table
- Secrets Manager secrets
- CloudWatch log groups
- CloudWatch dead-letter queue alarm

This path requires Docker locally because CDK builds container image assets.

### 1. Synthesize

```bash
npm run cdk:containers:synth
```

### 2. Deploy

```bash
npm run cdk:containers:deploy
```

After deploy, copy these outputs:

- `ApiUrl`
- `DayaApiKeySecretName`
- `DayaWebhookSecretName`
- `WebhookQueueUrl`
- `WebhookDeadLetterQueueUrl`

### 3. Update Secrets

```bash
aws secretsmanager put-secret-value \
  --secret-id <DayaApiKeySecretName> \
  --secret-string "<DAYA_SANDBOX_API_KEY>"
```

```bash
aws secretsmanager put-secret-value \
  --secret-id <DayaWebhookSecretName> \
  --secret-string "<DAYA_WEBHOOK_SECRET>"
```

Restart the ECS services after changing secret values:

```bash
aws ecs update-service \
  --cluster <cluster-name> \
  --service <api-service-name> \
  --force-new-deployment
```

```bash
aws ecs update-service \
  --cluster <cluster-name> \
  --service <worker-service-name> \
  --force-new-deployment
```

### 4. Configure Daya Webhook URL

Use:

```text
<ApiUrl>/webhooks/daya
```

## Production Notes

- Keep the public dashboard behind authentication before using this pattern outside a walkthrough.
- Disable public test-payment and clear-record routes in a real environment.
- Add HTTPS and a custom domain before sharing broadly.
- Add alarm notifications, not just CloudWatch alarms.
- Shape DynamoDB indexes around real reconciliation queries.
- Treat Business API funding accounts and Pro trading flows as separate product concepts unless the integration intentionally combines them.
