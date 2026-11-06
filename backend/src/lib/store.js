import { config } from "../config.js";
import { JsonStore } from "./jsonStore.js";

/** Single store instance shared by every service. */
export const store = new JsonStore({
  dataDir: config.dataDir,
  backupRetention: config.backupRetention,
});
