import type { NostrEvent, OkResponse, ReqCommand, ReqFilter, TaggedNostrEvent } from "./nostr.ts";
import type { CacheRelay } from "./cache-relay.ts";
import type { Connection } from "./connection.ts";
import { NoteCollection } from "./note-collection.ts";

/**
 * Use a regular connection as a CacheRelay
 */
export class ConnectionCacheRelay implements CacheRelay {
  #eventsSent = new Set<string>();

  constructor(readonly connection: Connection) {}

  async event(ev: NostrEvent): Promise<OkResponse> {
    if (this.#eventsSent.has(ev.id))
      return {
        ok: true,
        id: ev.id,
        message: "duplicate",
      } as OkResponse;
    this.#eventsSent.add(ev.id);
    return await this.connection.publish(ev);
  }

  query(req: ReqCommand): Promise<NostrEvent[]> {
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const results = new NoteCollection();
      const evh = (s: string, e: TaggedNostrEvent) => {
        if (s === id) {
          results.add(e);
        }
      };
      const eoh = (s: string) => {
        if (s === id) {
          resolve(results.snapshot);
          this.connection.closeRequest(id);
          this.connection.off("event", evh);
          this.connection.off("eose", eoh);
          this.connection.off("closed", eoh);
        }
      };
      this.connection.on("event", evh);
      this.connection.on("eose", eoh);
      this.connection.on("closed", eoh);
      this.connection.request(["REQ", id, ...(req.slice(2) as Array<ReqFilter>)]);
    });
  }

  delete(req: ReqCommand): Promise<string[]> {
    // ignored
    return Promise.resolve([]);
  }
}
