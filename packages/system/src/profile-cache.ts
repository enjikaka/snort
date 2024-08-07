import { unixNowMs } from "jsr:@enjikaka/snort-shared@^1.3.8";
import { EventKind, type TaggedNostrEvent, RequestBuilder } from "./index.ts";
import { ProfileCacheExpire } from "./const.ts";
import { mapEventToProfile, type CachedMetadata } from "./cache/index.ts";
import { BackgroundLoader } from "./background-loader.ts";

export class ProfileLoaderService extends BackgroundLoader<CachedMetadata> {
  override name(): string {
    return "ProfileLoaderService";
  }

  override onEvent(e: Readonly<TaggedNostrEvent>): CachedMetadata | undefined {
    return mapEventToProfile(e);
  }

  override getExpireCutoff(): number {
    return unixNowMs() - ProfileCacheExpire;
  }

  override buildSub(missing: string[]): RequestBuilder {
    const sub = new RequestBuilder(`profiles`);
    sub.withFilter().kinds([EventKind.SetMetadata]).authors(missing);
    return sub;
  }
}
