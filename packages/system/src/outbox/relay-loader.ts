import { EventKind, RequestBuilder, type TaggedNostrEvent, type UsersRelays } from "../index.ts";
import { unixNowMs } from "jsr:@enjikaka/snort-shared@^1.3.8";
import { RelayListCacheExpire } from "../const.ts";
import { BackgroundLoader } from "../background-loader.ts";
import { parseRelaysFromKind } from "./index.ts";

export class RelayMetadataLoader extends BackgroundLoader<UsersRelays> {
  override name(): string {
    return "RelayMetadataLoader";
  }

  override onEvent(e: Readonly<TaggedNostrEvent>): UsersRelays | undefined {
    const relays = parseRelaysFromKind(e);
    if (!relays) return;
    return {
      relays: relays,
      pubkey: e.pubkey,
      created: e.created_at,
      loaded: unixNowMs(),
    };
  }

  override getExpireCutoff(): number {
    return unixNowMs() - RelayListCacheExpire;
  }

  protected override buildSub(missing: string[]): RequestBuilder {
    const rb = new RequestBuilder("relay-loader");
    rb.withOptions({
      skipDiff: true,
      timeout: 10000,
      outboxPickN: 4,
    });
    rb.withFilter().authors(missing).kinds([EventKind.Relays, EventKind.ContactList]);
    return rb;
  }
}
