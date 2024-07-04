import { type WorkQueueItem, processWorkQueue, barrierQueue, unwrap } from "@enjikaka/snort-shared";
import type { EventSigner, NostrEvent } from "../index.ts";

const Nip7Queue: Array<WorkQueueItem> = [];
processWorkQueue(Nip7Queue);

declare interface Nip44Window {
  nostr?: {
    nip44?: {
      encrypt(recipientHexPubKey: string, value: string): Promise<string>;
      decrypt(senderHexPubKey: string, value: string): Promise<string>;
    };
  };
}

export class Nip7Signer implements EventSigner {
  get supports(): string[] {
    const supports = ["nip04"];
    if (globalThis.nostr && "nip44" in globalThis.nostr) {
      supports.push("nip44");
    }
    return supports;
  }

  init(): Promise<void> {
    return Promise.resolve();
  }

  async getPubKey(): Promise<string> {
    if (!globalThis.nostr) {
      throw new Error("Cannot use NIP-07 signer, not found!");
    }
    return await barrierQueue(Nip7Queue, () => unwrap(globalThis.nostr).getPublicKey());
  }

  async nip4Encrypt(content: string, key: string): Promise<string> {
    if (!globalThis.nostr) {
      throw new Error("Cannot use NIP-07 signer, not found!");
    }
    return await barrierQueue(Nip7Queue, () =>
      unwrap(window.nostr?.nip04?.encrypt).call(window.nostr?.nip04, key, content),
    );
  }

  async nip4Decrypt(content: string, otherKey: string): Promise<string> {
    if (!globalThis.nostr) {
      throw new Error("Cannot use NIP-07 signer, not found!");
    }
    return await barrierQueue(Nip7Queue, () =>
      unwrap(window.nostr?.nip04?.decrypt).call(window.nostr?.nip04, otherKey, content),
    );
  }

  async nip44Encrypt(content: string, key: string): Promise<string> {
    if (!globalThis.nostr) {
      throw new Error("Cannot use NIP-07 signer, not found!");
    }
    return await barrierQueue(Nip7Queue, async () => {
      const window = globalThis.window as Nip44Window;
      return await window.nostr!.nip44!.encrypt(key, content);
    });
  }

  async nip44Decrypt(content: string, otherKey: string): Promise<string> {
    if (!globalThis.nostr) {
      throw new Error("Cannot use NIP-07 signer, not found!");
    }
    return await barrierQueue(Nip7Queue, async () => {
      const window = globalThis.window as Nip44Window;
      return await window.nostr!.nip44!.decrypt(otherKey, content);
    });
  }

  async sign(ev: NostrEvent): Promise<NostrEvent> {
    if (!globalThis.nostr) {
      throw new Error("Cannot use NIP-07 signer, not found!");
    }
    return await barrierQueue(Nip7Queue, async () => {
      const signed = await unwrap(globalThis.nostr).signEvent(ev);
      return {
        ...ev,
        sig: signed.sig,
      };
    });
  }
}
