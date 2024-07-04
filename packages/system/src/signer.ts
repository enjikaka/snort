import { bytesToHex } from "npm:@noble/curves@1.4.0/abstract/utils";
import { getPublicKey } from "@enjikaka/snort-shared";
import { EventExt } from "./event-ext.ts";
import { Nip4WebCryptoEncryptor } from "./impl/nip4.ts";
import { XChaCha20Encryptor } from "./impl/nip44.ts";
import { MessageEncryptorVersion, decodeEncryptionPayload, encodeEncryptionPayload } from "./index.ts";
import { NostrEvent, NotSignedNostrEvent } from "./nostr.ts";
import { base64 } from "npm:@scure/base@1.1.7";

export type SignerSupports = "nip04" | "nip44" | string;

export interface EventSigner {
  init(): Promise<void>;
  getPubKey(): Promise<string> | string;
  nip4Encrypt(content: string, key: string): Promise<string>;
  nip4Decrypt(content: string, otherKey: string): Promise<string>;
  nip44Encrypt(content: string, key: string): Promise<string>;
  nip44Decrypt(content: string, otherKey: string): Promise<string>;
  sign(ev: NostrEvent | NotSignedNostrEvent): Promise<NostrEvent>;
  get supports(): Array<SignerSupports>;
}

export class PrivateKeySigner implements EventSigner {
  #publicKey: string;
  #privateKey: string;

  constructor(privateKey: string | Uint8Array) {
    if (typeof privateKey === "string") {
      this.#privateKey = privateKey;
    } else {
      this.#privateKey = bytesToHex(privateKey);
    }
    this.#publicKey = getPublicKey(this.#privateKey);
  }

  get supports(): string[] {
    return ["nip04", "nip44"];
  }

  get privateKey(): string {
    return this.#privateKey;
  }

  init(): Promise<void> {
    return Promise.resolve();
  }

  getPubKey(): string {
    return this.#publicKey;
  }

  async nip4Encrypt(content: string, key: string): Promise<string> {
    const enc = new Nip4WebCryptoEncryptor();
    const secret = enc.getSharedSecret(this.privateKey, key);
    const data = await enc.encryptData(content, secret);
    return `${base64.encode(data.ciphertext)}?iv=${base64.encode(data.nonce)}`;
  }

  async nip4Decrypt(content: string, otherKey: string): Promise<string> {
    const enc = new Nip4WebCryptoEncryptor();
    const secret = enc.getSharedSecret(this.privateKey, otherKey);
    const [ciphertext, iv] = content.split("?iv=");

    return await enc.decryptData(
      {
        ciphertext: base64.decode(ciphertext),
        nonce: base64.decode(iv),
        v: MessageEncryptorVersion.Nip4,
      },
      secret,
    );
  }

  nip44Encrypt(content: string, key: string): Promise<any> {
    const enc = new XChaCha20Encryptor();
    const shared = enc.getSharedSecret(this.#privateKey, key);
    const data = enc.encryptData(content, shared);

    return Promise.resolve(encodeEncryptionPayload(data));
  }

  nip44Decrypt(content: string, otherKey: string): Promise<string> {
    const payload = decodeEncryptionPayload(content);
    if (payload.v !== MessageEncryptorVersion.XChaCha20) throw new Error("Invalid payload version");

    const enc = new XChaCha20Encryptor();
    const shared = enc.getSharedSecret(this.#privateKey, otherKey);

    return Promise.resolve(enc.decryptData(payload, shared));
  }

  sign(ev: NostrEvent): Promise<NostrEvent> {
    EventExt.sign(ev, this.#privateKey);
    return Promise.resolve(ev);
  }
}
