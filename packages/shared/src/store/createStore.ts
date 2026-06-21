import { AppConfig } from "../config";
import { DynamoStore } from "./dynamoStore";
import { LocalStore } from "./localStore";
import { StateStore } from "./stateStore";

export function createStore(config: AppConfig): StateStore {
  if (config.stateBackend === "dynamodb") {
    if (!config.stateTableName) {
      throw new Error("STATE_TABLE_NAME is required when STATE_BACKEND=dynamodb");
    }

    return new DynamoStore(config.stateTableName, config.awsRegion);
  }

  return new LocalStore(config.dataDir);
}
