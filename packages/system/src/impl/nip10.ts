import { dedupe, unwrap } from "jsr:@enjikaka/snort-shared@^1.3.8";
import type { EventBuilder } from "../event-builder.ts";
import type { NostrEvent } from "../nostr.ts";
import { NostrLink } from "../nostr-link.ts";

export interface Nip10Thread {
  root?: NostrLink;
  replyTo?: NostrLink;
  mentions: Array<NostrLink>;
  pubKeys: Array<NostrLink>;
}

/**
 * Utility class which exports functions used in NIP-10
 */
export class Nip10 {
  /**
   * Reply to an event using NIP-10 tagging
   */
  static replyTo(ev: NostrEvent, eb: EventBuilder) {
    const link = NostrLink.fromEvent(ev);
    const thread = Nip10.parseThread(ev);
    if (thread) {
      const rootOrReplyAsRoot = thread.root || thread.replyTo;
      if (rootOrReplyAsRoot) {
        eb.tag(unwrap(rootOrReplyAsRoot.toEventTag("root")));
      }
      eb.tag(unwrap(link.toEventTag("reply")));

      for (const pk of thread.pubKeys) {
        if (pk.id === eb.pubkey) {
          continue;
        }
        eb.tag(unwrap(pk.toEventTag()));
      }
    } else {
      eb.tag(unwrap(link.toEventTag("root")));
      if (ev.pubkey !== eb.pubkey) {
        eb.tag(["p", ev.pubkey]);
      }
    }
  }

  static parseThread(ev: NostrEvent): Nip10Thread | undefined {
    const ret = {
      mentions: [],
      pubKeys: [],
    } as Nip10Thread;
    const replyTags = ev.tags.filter(a => a[0] === "e" || a[0] === "a").map(a => NostrLink.fromTag(a));
    if (replyTags.length > 0) {
      const marked = replyTags.some(a => a.marker);
      if (!marked) {
        ret.root = replyTags[0];
        if (replyTags.length > 1) {
          ret.replyTo = replyTags[replyTags.length - 1];
        }
        if (replyTags.length > 2) {
          ret.mentions = replyTags.slice(1, -1);
        }
      } else {
        const root = replyTags.find(a => a.marker === "root");
        const reply = replyTags.find(a => a.marker === "reply");
        ret.root = root;
        ret.replyTo = reply;
        ret.mentions = replyTags.filter(a => a.marker === "mention");
      }
    } else {
      return undefined;
    }
    ret.pubKeys = dedupe(ev.tags.filter(a => a[0] === "p").map(a => a[1])).map(a => NostrLink.publicKey(a));
    return ret;
  }
}
