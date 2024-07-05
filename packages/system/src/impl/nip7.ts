import { type WorkQueueItem, processWorkQueue, barrierQueue, unwrap } from "jsr:@enjikaka/snort-shared@1.3.7";
import type { EventSigner, NostrEvent } from "../index.ts";

const Nip7Queue: Array<WorkQueueItem> = [];
processWorkQueue(Nip7Queue);

declare interface Nip44Window {
  nostr: {
    getPublicKey: () => string;
    signEvent: (ev: object) => object & { sig: string };
    nip04?: {
      encrypt(recipientHexPubKey: string, value: string): Promise<string>;
      decrypt(senderHexPubKey: string, value: string): Promise<string>;
    };
    nip44?: {
      encrypt(recipientHexPubKey: string, value: string): Promise<string>;
      decrypt(senderHexPubKey: string, value: string): Promise<string>;
    };
  };
}

export class Nip7Signer implements EventSigner {
  get supports(): string[] {
    const supports = ["nip04"];

    if ('nostr' in globalThis) {
      const nipWindow = globalThis as unknown as Nip44Window;

      if (nipWindow.nostr && "nip44" in nipWindow.nostr) {
        supports.push("nip44");
      }
    }

    return supports;
  }

  init(): Promise<void> {
    return Promise.resolve();
  }

  getPubKey(): Promise<string> {
    if (!('nostr' in globalThis)) {
      throw new Error("Cannot use NIP-07 signer, not found!");
    }

    return barrierQueue(Nip7Queue, () => Promise.resolve(unwrap((globalThis as unknown as Nip44Window).nostr).getPublicKey()));
  }

  async nip4Encrypt(content: string, key: string): Promise<string> {
    if (!('nostr' in globalThis)) {
      throw new Error("Cannot use NIP-07 signer, not found!");
    }

    return await barrierQueue(Nip7Queue, () =>
      unwrap((globalThis as unknown as Nip44Window).nostr.nip04?.encrypt).call((globalThis as unknown as Nip44Window).nostr.nip04, key, content),
    );
  }

  async nip4Decrypt(content: string, otherKey: string): Promise<string> {
    if (!('nostr' in globalThis)) {
      throw new Error("Cannot use NIP-07 signer, not found!");
    }
    return await barrierQueue(Nip7Queue, () => {
      const window = globalThis.window as unknown as Nip44Window;

      return unwrap(window.nostr.nip04?.decrypt).call(window.nostr.nip04, otherKey, content);
    });
  }

  async nip44Encrypt(content: string, key: string): Promise<string> {
    if (!('nostr' in globalThis)) {
      throw new Error("Cannot use NIP-07 signer, not found!");
    }
    return await barrierQueue(Nip7Queue, async () => {
      const window = globalThis.window as unknown as Nip44Window;

      return await window.nostr!.nip44!.encrypt(key, content);
    });
  }

  async nip44Decrypt(content: string, otherKey: string): Promise<string> {
    if (!('nostr' in globalThis)) {
      throw new Error("Cannot use NIP-07 signer, not found!");
    }
    return await barrierQueue(Nip7Queue, async () => {
      const window = globalThis.window as unknown as Nip44Window;

      return await window.nostr!.nip44!.decrypt(otherKey, content);
    });
  }

  async sign(ev: NostrEvent): Promise<NostrEvent> {
    if (!('nostr' in globalThis)) {
      throw new Error("Cannot use NIP-07 signer, not found!");
    }
    return await barrierQueue(Nip7Queue, async () => {
      const signed = await unwrap((globalThis as unknown as Nip44Window).nostr).signEvent(ev);

      return {
        ...ev,
        sig: signed.sig,
      };
    });
  }
}
