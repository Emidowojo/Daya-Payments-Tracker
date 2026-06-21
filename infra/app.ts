import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sqs from "aws-cdk-lib/aws-sqs";

class DayaPaymentTrackerContainersStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2
    });

    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc
    });

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
      description: "Daya sandbox or production API key for the payment tracker"
    });

    const dayaWebhookSecret = new secretsmanager.Secret(this, "DayaWebhookSecret", {
      description: "Daya webhook signing secret for the payment tracker"
    });

    const apiLogGroup = new logs.LogGroup(this, "ApiLogGroup", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const workerLogGroup = new logs.LogGroup(this, "WorkerLogGroup", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const apiService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, "ApiService", {
      cluster,
      desiredCount: 1,
      cpu: 256,
      memoryLimitMiB: 512,
      circuitBreaker: {
        rollback: true
      },
      minHealthyPercent: 100,
      taskImageOptions: {
        image: ecs.ContainerImage.fromAsset(".", {
          file: "Dockerfile.api"
        }),
        containerPort: 3000,
        environment: {
          NODE_ENV: "production",
          PORT: "3000",
          QUEUE_MODE: "sqs",
          STATE_BACKEND: "dynamodb",
          SQS_QUEUE_URL: webhookQueue.queueUrl,
          DAYA_BASE_URL: "https://api.sandbox.daya.co",
          DAYA_MOCK_MODE: "false",
          DAYA_REQUIRE_WEBHOOK_SIGNATURE: "true",
          DATA_DIR: "/tmp/data",
          STATE_TABLE_NAME: table.tableName
        },
        secrets: {
          DAYA_API_KEY: ecs.Secret.fromSecretsManager(dayaApiKey),
          DAYA_WEBHOOK_SECRET: ecs.Secret.fromSecretsManager(dayaWebhookSecret)
        },
        logDriver: ecs.LogDrivers.awsLogs({
          streamPrefix: "api",
          logGroup: apiLogGroup
        })
      }
    });

    apiService.targetGroup.configureHealthCheck({
      path: "/health",
      healthyHttpCodes: "200"
    });

    const workerTaskDefinition = new ecs.FargateTaskDefinition(this, "WorkerTaskDefinition", {
      cpu: 256,
      memoryLimitMiB: 512
    });

    workerTaskDefinition.addContainer("Worker", {
      image: ecs.ContainerImage.fromAsset(".", {
        file: "Dockerfile.worker"
      }),
      environment: {
        NODE_ENV: "production",
        QUEUE_MODE: "sqs",
        STATE_BACKEND: "dynamodb",
        SQS_QUEUE_URL: webhookQueue.queueUrl,
        DAYA_BASE_URL: "https://api.sandbox.daya.co",
        DAYA_MOCK_MODE: "false",
        DATA_DIR: "/tmp/data",
        STATE_TABLE_NAME: table.tableName
      },
      secrets: {
        DAYA_API_KEY: ecs.Secret.fromSecretsManager(dayaApiKey),
        DAYA_WEBHOOK_SECRET: ecs.Secret.fromSecretsManager(dayaWebhookSecret)
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "worker",
        logGroup: workerLogGroup
      })
    });

    const workerService = new ecs.FargateService(this, "WorkerService", {
      cluster,
      taskDefinition: workerTaskDefinition,
      desiredCount: 1,
      assignPublicIp: false,
      circuitBreaker: {
        rollback: true
      },
      minHealthyPercent: 100
    });

    webhookQueue.grantSendMessages(apiService.taskDefinition.taskRole);
    webhookQueue.grantConsumeMessages(workerTaskDefinition.taskRole);
    table.grantReadWriteData(apiService.taskDefinition.taskRole);
    table.grantReadWriteData(workerTaskDefinition.taskRole);
    dayaApiKey.grantRead(apiService.taskDefinition.taskRole);
    dayaApiKey.grantRead(workerTaskDefinition.taskRole);
    dayaWebhookSecret.grantRead(apiService.taskDefinition.taskRole);
    dayaWebhookSecret.grantRead(workerTaskDefinition.taskRole);

    new cloudwatch.Alarm(this, "WebhookDlqAlarm", {
      metric: deadLetterQueue.metricApproximateNumberOfMessagesVisible(),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: "A Daya webhook event reached the dead-letter queue"
    });

    new cdk.CfnOutput(this, "ApiUrl", {
      value: `http://${apiService.loadBalancer.loadBalancerDnsName}`
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

new DayaPaymentTrackerContainersStack(app, "DayaPaymentTrackerContainersStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1"
  }
});
