import { EventKind, type FullRelaySettings, type NostrEvent, type SystemInterface, type UsersRelays } from "../index.ts";
import { removeUndefined, sanitizeRelayUrl } from "jsr:@enjikaka/snort-shared@^1.3.8";

export const DefaultPickNRelays = 2;

export interface AuthorsRelaysCache {
  getFromCache(pubkey?: string): UsersRelays | undefined;
  update(obj: UsersRelays): Promise<"new" | "updated" | "refresh" | "no_change">;
  buffer(keys: Array<string>): Promise<Array<string>>;
  bulkSet(objs: Array<UsersRelays>): Promise<void>;
}

export interface PickedRelays {
  key: string;
  relays: Array<string>;
}

export type EventFetcher = {
  Fetch: SystemInterface["Fetch"];
};

export function parseRelayTag(tag: Array<string>): FullRelaySettings | undefined {
  if (tag[0] !== "r") return;
  const url = sanitizeRelayUrl(tag[1]);
  if (url) {
    return {
      url,
      settings: {
        read: tag[2] === "read" || tag[2] === undefined,
        write: tag[2] === "write" || tag[2] === undefined,
      },
    } as FullRelaySettings;
  }
}

export function parseRelayTags(tag: Array<Array<string>>): FullRelaySettings[] | undefined {
  return removeUndefined(tag.map(parseRelayTag));
}

export function parseRelaysFromKind(ev: NostrEvent): FullRelaySettings[] | undefined {
  if (ev.kind === EventKind.ContactList) {
    const relaysInContent =
      ev.content.length > 0 ? (JSON.parse(ev.content) as Record<string, { read: boolean; write: boolean }>) : undefined;
    if (relaysInContent) {
      return removeUndefined(
        Object.entries(relaysInContent).map(([k, v]) => {
          const url = sanitizeRelayUrl(k);
          if (url) {
            return {
              url,
              settings: {
                read: v.read,
                write: v.write,
              },
            } as FullRelaySettings;
          }
        }),
      );
    }
  } else if (ev.kind === EventKind.Relays) {
    return parseRelayTags(ev.tags);
  }
}

/**
 * Convert relay settings into NIP-65 relay tag
 */
export function settingsToRelayTag(rx: FullRelaySettings): string[] | undefined {
  const rTag = ["r", rx.url];
  if (rx.settings.read && !rx.settings.write) {
    rTag.push("read");
  }
  if (rx.settings.write && !rx.settings.read) {
    rTag.push("write");
  }
  if (rx.settings.read || rx.settings.write) {
    return rTag;
  }
}

export * from "./outbox-model.ts";
export * from "./relay-loader.ts";
