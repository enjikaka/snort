import { NostrEvent } from "../nostr.ts";
import { DexieTableLike, FeedCache } from "@enjikaka/snort-shared";

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
