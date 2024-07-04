import { RelayMetrics } from "./index.ts";
import { DexieTableLike, FeedCache } from "@enjikaka/snort-shared";

export class RelayMetricCache extends FeedCache<RelayMetrics> {
  constructor(table?: DexieTableLike<RelayMetrics>) {
    super("RelayMetrics", table);
  }

  key(of: RelayMetrics): string {
    return of.addr;
  }

  override async preload(): Promise<void> {
    await super.preload();
    // load everything
    await this.buffer([...this.onTable]);
  }

  takeSnapshot(): Array<RelayMetrics> {
    return [...this.cache.values()];
  }

  async search(): Promise<RelayMetrics[]> {
    return <Array<RelayMetrics>>[];
  }
}
