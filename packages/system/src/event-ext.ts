import * as secp from "npm:@noble/curves@1.4.0/secp256k1";
import * as utils from "npm:@noble/curves@1.4.0/abstract/utils";
import { getPublicKey, sha256, unixNow } from "jsr:@enjikaka/snort-shared@1.3.7";

import type { EventKind, HexKey, NostrEvent, NotSignedNostrEvent } from "./index.ts";
import { type NostrPowEvent, minePow } from "./pow-util.ts";
import { findTag } from "./utils.ts";

export interface Tag {
  key: string;
  value?: string;
  relay?: string;
  marker?: string; // NIP-10
  author?: string; // NIP-10 "pubkey-stub"
}

export interface Thread {
  root?: Tag;
  replyTo?: Tag;
  mentions: Array<Tag>;
  pubKeys: Array<HexKey>;
}

export const enum EventType {
  Regular,
  Replaceable,
  ParameterizedReplaceable,
}

export abstract class EventExt {
  /**
   * Get the pub key of the creator of this event NIP-26
   */
  static getRootPubKey(e: NostrEvent): HexKey {
    const delegation = e.tags.find(a => a[0] === "delegation");
    if (delegation?.[1]) {
      // todo: verify sig
      return delegation[1];
    }
    return e.pubkey;
  }

  /**
   * Sign this message with a private key
   */
  static sign(e: NostrEvent, key: HexKey): NostrEvent {
    e.pubkey = getPublicKey(key);
    e.id = this.createId(e);

    const sig = secp.schnorr.sign(e.id, key);
    e.sig = utils.bytesToHex(sig);
    return e;
  }

  /**
   * Check the signature of this message
   * @returns True if valid signature
   */
  static verify(e: NostrEvent): boolean {
    if ((e.sig?.length ?? 0) < 64) return false;
    const id = this.createId(e);
    const result = secp.schnorr.verify(e.sig, id, e.pubkey);
    return result;
  }

  static createId(e: NostrEvent | NotSignedNostrEvent): string {
    const payload = [0, e.pubkey, e.created_at, e.kind, e.tags, e.content];
    return sha256(JSON.stringify(payload));
  }

  /**
   * Mine POW for an event (NIP-13)
   */
  static minePow(e: NostrEvent, target: number): NostrPowEvent {
    return minePow(e, target);
  }

  /**
   * Create a new event for a specific pubkey
   */
  static forPubKey(pk: HexKey, kind: EventKind): NostrEvent {
    return {
      pubkey: pk,
      kind: kind,
      created_at: unixNow(),
      content: "",
      tags: [],
      id: "",
      sig: "",
    } as NostrEvent;
  }

  static parseTag(tag: Array<string>): Tag {
    if (tag.length < 1) {
      throw new Error("Invalid tag, must have more than 2 items");
    }

    const ret = {
      key: tag[0],
      value: tag[1],
    } as Tag;
    switch (ret.key) {
      case "a": {
        ret.relay = tag[2];
        ret.marker = tag[3];
        break;
      }
      case "e": {
        ret.relay = tag[2];
        ret.marker = tag[3];
        ret.author = tag[4];
        break;
      }
    }
    return ret;
  }

  static extractThread(ev: NostrEvent): Thread | undefined {
    const ret = {
      mentions: [],
      pubKeys: [],
    } as Thread;
    const replyTags = ev.tags.filter(a => a[0] === "e" || a[0] === "a").map(a => EventExt.parseTag(a));
    if (replyTags.length > 0) {
      const marked = replyTags.some(a => a.marker);
      if (!marked) {
        ret.root = replyTags[0];
        ret.root.marker = "root";
        if (replyTags.length > 1) {
          ret.replyTo = replyTags[replyTags.length - 1];
          ret.replyTo.marker = "reply";
        }
        if (replyTags.length > 2) {
          ret.mentions = replyTags.slice(1, -1);
          ret.mentions.forEach(a => (a.marker = "mention"));
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
    ret.pubKeys = Array.from(new Set(ev.tags.filter(a => a[0] === "p").map(a => a[1])));
    return ret;
  }

  /**
   * Assign props if undefined
   */
  static fixupEvent(e: NostrEvent): void {
    e.tags ??= [];
    e.created_at ??= 0;
    e.content ??= "";
    e.id ??= "";
    e.kind ??= 0;
    e.pubkey ??= "";
    e.sig ??= "";
  }

  static getType(kind: number): EventType {
    const legacyReplaceable = [0, 3, 41];
    if (kind >= 30_000 && kind < 40_000) {
      return EventType.ParameterizedReplaceable;
    } else if (kind >= 10_000 && kind < 20_000) {
      return EventType.Replaceable;
    } else if (legacyReplaceable.includes(kind)) {
      return EventType.Replaceable;
    } else {
      return EventType.Regular;
    }
  }

  static isValid(ev: NostrEvent): boolean {
    const type = EventExt.getType(ev.kind);
    if (type === EventType.ParameterizedReplaceable) {
      if (!findTag(ev, "d")) return false;
    }
    return ev.sig !== undefined;
  }
}
