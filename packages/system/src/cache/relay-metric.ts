import { RelayMetrics } from "./index.ts";
import { DexieTableLike, FeedCache } from "npm:@snort/shared@1.0.16";

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

  async search() {
    return <Array<RelayMetrics>>[];
  }
}
