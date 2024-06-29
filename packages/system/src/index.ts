import { base64 } from "@scure/base";

export { NostrSystem } from "./nostr-system.ts";
export { NDKSystem } from "./ndk-system.ts";
export { default as EventKind } from "./event-kind.ts";
export { default as SocialGraph, socialGraphInstance } from "./SocialGraph/SocialGraph.ts";
export * from "./system.ts";
export * from "./SocialGraph/UniqueIds.ts";
export * from "./nostr.ts";
export * from "./links.ts";
export * from "./nips.ts";
export * from "./relay-info.ts";
export * from "./event-ext.ts";
export * from "./connection.ts";
export * from "./note-collection.ts";
export * from "./request-builder.ts";
export * from "./event-publisher.ts";
export * from "./event-builder.ts";
export * from "./nostr-link.ts";
export * from "./profile-cache.ts";
export * from "./impl/nip57.ts";
export * from "./signer.ts";
export * from "./text.ts";
export * from "./pow.ts";
export * from "./pow-util.ts";
export * from "./query-optimizer/index.ts";
export * from "./encrypted.ts";
export * from "./outbox/index.ts";
export * from "./sync/index.ts";
export * from "./user-state.ts";
export * from "./cache-relay.ts";
export * from "./connection-cache-relay.ts";

export * from "./impl/nip4.ts";
export * from "./impl/nip7.ts";
export * from "./impl/nip10.ts";
export * from "./impl/nip44.ts";
export * from "./impl/nip46.ts";
export * from "./impl/nip57.ts";

export * from "./cache/index.ts";
export * from "./cache/user-relays.ts";
export * from "./cache/user-metadata.ts";
export * from "./cache/relay-metric.ts";

export const enum MessageEncryptorVersion {
  Nip4 = 0,
  XChaCha20 = 1,
}

export interface MessageEncryptorPayload {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  v: MessageEncryptorVersion;
}

export interface MessageEncryptor {
  getSharedSecret(privateKey: string, publicKey: string): Promise<Uint8Array> | Uint8Array;
  encryptData(plaintext: string, sharedSecet: Uint8Array): Promise<MessageEncryptorPayload> | MessageEncryptorPayload;
  decryptData(payload: MessageEncryptorPayload, sharedSecet: Uint8Array): Promise<string> | string;
}

export function decodeEncryptionPayload(p: string): MessageEncryptorPayload {
  if (p.startsWith("{") && p.endsWith("}")) {
    const pj = JSON.parse(p) as { v: number; nonce: string; ciphertext: string };
    return {
      v: pj.v,
      nonce: base64.decode(pj.nonce),
      ciphertext: base64.decode(pj.ciphertext),
    };
  } else if (p.includes("?iv=")) {
    const [ciphertext, nonce] = p.split("?iv=");
    return {
      v: MessageEncryptorVersion.Nip4,
      nonce: base64.decode(nonce),
      ciphertext: base64.decode(ciphertext),
    };
  } else {
    const buf = base64.decode(p);
    return {
      v: buf[0],
      nonce: buf.subarray(1, 25),
      ciphertext: buf.subarray(25),
    };
  }
}

export function encodeEncryptionPayload(p: MessageEncryptorPayload) {
  return base64.encode(new Uint8Array([p.v, ...p.nonce, ...p.ciphertext]));
}
