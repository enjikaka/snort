import type { NostrEvent, OkResponse, ReqCommand } from "./nostr.ts";

/**
 * A cache relay is an always available local (local network / browser worker) relay
 * Which should contain all of the content we're looking for and respond quickly.
 */
export interface CacheRelay {
  /**
   * Write event to cache relay
   */
  event(ev: NostrEvent): Promise<OkResponse>;

  /**
   * Read event from cache relay
   */
  query(req: ReqCommand): Promise<Array<NostrEvent>>;

  /**
   * Delete events by filter
   */
  delete(req: ReqCommand): Promise<Array<string>>;
}
