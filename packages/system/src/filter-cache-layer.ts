import type { BuiltRawReqFilter } from "./request-builder.ts";
import type { NostrEvent } from "./nostr.ts";
import type { Query } from "./query.ts";

export interface EventCache {
  bulkGet: (ids: Array<string>) => Promise<Array<NostrEvent>>;
}

export interface FilterCacheLayer {
  processFilter(q: Query, req: BuiltRawReqFilter): Promise<BuiltRawReqFilter>;
}
