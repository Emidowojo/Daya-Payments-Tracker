import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sqs from "aws-cdk-lib/aws-sqs";

class DayaPaymentTrackerServerlessStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const deadLetterQueue = new sqs.Queue(this, "WebhookDeadLetterQueue", {
      retentionPeriod: cdk.Duration.days(14)
    });

    const webhookQueue = new sqs.Queue(this, "WebhookQueue", {
      visibilityTimeout: cdk.Duration.seconds(60),
      retentionPeriod: cdk.Duration.days(4),
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 5
      }
    });

    const table = new dynamodb.Table(this, "StateTable", {
      partitionKey: {
        name: "pk",
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: "sk",
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const dayaApiKey = new secretsmanager.Secret(this, "DayaApiKey", {
      description: "Daya sandbox or production API key for the serverless payment tracker"
    });

    const dayaWebhookSecret = new secretsmanager.Secret(this, "DayaWebhookSecret", {
      description: "Daya webhook signing secret for the serverless payment tracker"
    });

    const sharedEnvironment = {
      NODE_ENV: "production",
      STATE_TABLE_NAME: table.tableName,
      SQS_QUEUE_URL: webhookQueue.queueUrl,
      DAYA_BASE_URL: "https://api.sandbox.daya.co",
      DAYA_MOCK_MODE: "true",
      DAYA_REQUIRE_WEBHOOK_SIGNATURE: "true",
      ALLOW_APP_ACTIONS: "true",
      ALLOW_RESET: "true",
      DAYA_API_KEY: dayaApiKey.secretValue.unsafeUnwrap(),
      DAYA_WEBHOOK_SECRET: dayaWebhookSecret.secretValue.unsafeUnwrap()
    };

    const apiLogGroup = new logs.LogGroup(this, "ApiLogGroup", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const workerLogGroup = new logs.LogGroup(this, "WorkerLogGroup", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const code = lambda.Code.fromAsset(".", {
      exclude: [
        ".git",
        ".npm-cache",
        "cdk.out",
        "data",
        "node_modules",
        "*.log"
      ]
    });

    const apiFunction = new lambda.Function(this, "ApiFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      handler: "dist/apps/lambda/src/api.handler",
      code,
      memorySize: 256,
      timeout: cdk.Duration.seconds(20),
      logGroup: apiLogGroup,
      environment: sharedEnvironment
    });

    const workerFunction = new lambda.Function(this, "WorkerFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      handler: "dist/apps/lambda/src/worker.handler",
      code,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      logGroup: workerLogGroup,
      environment: sharedEnvironment
    });

    workerFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(webhookQueue, {
        batchSize: 10,
        reportBatchItemFailures: true
      })
    );

    const functionUrl = apiFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedHeaders: ["Content-Type", "X-Daya-Signature"],
        allowedMethods: [lambda.HttpMethod.GET, lambda.HttpMethod.POST],
        allowedOrigins: ["*"]
      }
    });

    webhookQueue.grantSendMessages(apiFunction);
    webhookQueue.grantConsumeMessages(apiFunction);
    webhookQueue.grantPurge(apiFunction);
    webhookQueue.grantConsumeMessages(workerFunction);
    table.grantReadWriteData(apiFunction);
    table.grantReadWriteData(workerFunction);

    new cloudwatch.Alarm(this, "WebhookDlqAlarm", {
      metric: deadLetterQueue.metricApproximateNumberOfMessagesVisible(),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: "A Daya webhook event reached the dead-letter queue"
    });

    new cdk.CfnOutput(this, "ApiUrl", {
      value: functionUrl.url
    });

    new cdk.CfnOutput(this, "DayaWebhookUrl", {
      value: `${functionUrl.url}webhooks/daya`
    });

    new cdk.CfnOutput(this, "WebhookQueueUrl", {
      value: webhookQueue.queueUrl
    });

    new cdk.CfnOutput(this, "WebhookDeadLetterQueueUrl", {
      value: deadLetterQueue.queueUrl
    });

    new cdk.CfnOutput(this, "DayaApiKeySecretName", {
      value: dayaApiKey.secretName
    });

    new cdk.CfnOutput(this, "DayaWebhookSecretName", {
      value: dayaWebhookSecret.secretName
    });
  }
}

const app = new cdk.App();

new DayaPaymentTrackerServerlessStack(app, "DayaPaymentTrackerServerlessStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "eu-north-1"
  }
});
