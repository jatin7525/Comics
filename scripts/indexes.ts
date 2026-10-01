import { ensureIndexes } from "../src/infrastructure/mongo/indexes";
import { closeMongo } from "../src/infrastructure/mongo/connection";
ensureIndexes()
  .then(() => console.log("MongoDB indexes ready."))
  .finally(closeMongo);
