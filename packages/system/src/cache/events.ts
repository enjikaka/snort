import type { NostrEvent } from "../nostr.ts";
import { type DexieTableLike, FeedCache } from "jsr:@enjikaka/snort-shared@^1.3.8";

export class EventsCache extends FeedCache<NostrEvent> {
  constructor(table?: DexieTableLike<NostrEvent>) {
    super("EventsCache", table);
  }

  key(of: NostrEvent): string {
    return of.id;
  }

  override async preload(): Promise<void> {
    await super.preload();
    // load everything
    await this.buffer([...this.onTable]);
  }

  takeSnapshot(): Array<NostrEvent> {
    return [...this.cache.values()];
  }

  async search() {
    return <Array<NostrEvent>>[];
  }
}
