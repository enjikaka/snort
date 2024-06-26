import { UsersRelays } from "./index.ts";
import { DexieTableLike, FeedCache } from "npm:@snort/shared@1.0.16";

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
