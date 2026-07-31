import { createContentProfileLibrary } from "./library.ts";
import {
  strongrDailyContentProfileRegistryV1,
  strongrDailyContentProfileSourceManifestV1,
} from "./strongr-daily-v1.ts";

/**
 * Node/build-time verified library. Browser code imports the pinned registry
 * artifact directly so Node's hashing implementation never enters the client
 * bundle.
 */
export const strongrDailyContentProfileLibraryV1 = createContentProfileLibrary({
  registry: strongrDailyContentProfileRegistryV1,
  sourceManifest: strongrDailyContentProfileSourceManifestV1,
});
