declare module "#passed/store" {
  import type { StoreConfig } from "~/env";
  import type { SecretStore } from "~/utils/store/common";

  export function createStore(
    config: StoreConfig,
    maxSecrets: number,
  ): Promise<SecretStore>;
}
