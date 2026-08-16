import type { CromaGateway } from "./croma/client.js";
import type { VerifyStore } from "./db/queries.js";

export type ServerContext = {
  store: VerifyStore;
  croma: CromaGateway;
  log: (message: string) => void;
  now: () => number;
  newId: () => string;
};
