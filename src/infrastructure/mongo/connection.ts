import { MongoClient } from "mongodb";
import { config } from "@/server/config";

const globalMongo = globalThis as typeof globalThis & {
  astraMongo?: Promise<MongoClient>;
};
export async function mongoClient(): Promise<MongoClient> {
  if (!globalMongo.astraMongo) {
    const client = new MongoClient(config().MONGODB_URI, {
      maxPoolSize: 20,
      minPoolSize: 0,
      maxIdleTimeMS: 60_000,
      serverSelectionTimeoutMS: 5_000,
      waitQueueTimeoutMS: 5_000,
      connectTimeoutMS: 5_000,
      socketTimeoutMS: 15_000,
    });
    globalMongo.astraMongo = client.connect().catch((error) => {
      globalMongo.astraMongo = undefined;
      throw error;
    });
  }
  return globalMongo.astraMongo;
}
export async function database() {
  return (await mongoClient()).db(config().MONGODB_DATABASE);
}
export async function closeMongo() {
  if (globalMongo.astraMongo) await (await globalMongo.astraMongo).close();
  globalMongo.astraMongo = undefined;
}
