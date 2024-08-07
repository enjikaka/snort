import type { UsersRelays } from "./index.ts";
import { type DexieTableLike, FeedCache } from "jsr:@enjikaka/snort-shared@^1.3.8";

export class UserRelaysCache extends FeedCache<UsersRelays> {
  constructor(table?: DexieTableLike<UsersRelays>) {
    super("UserRelays", table);
  }

  key(of: UsersRelays): string {
    return of.pubkey;
  }

  override async preload(follows?: Array<string>): Promise<void> {
    await super.preload();
    if (follows) {
      await this.buffer(follows);
    }
  }

  newest(): number {
    let ret = 0;
    this.cache.forEach(v => (ret = v.created > ret ? v.created : ret));
    return ret;
  }

  takeSnapshot(): Array<UsersRelays> {
    return [...this.cache.values()];
  }

  async search(): Promise<UsersRelays[]> {
    return <Array<UsersRelays>>[];
  }
}
