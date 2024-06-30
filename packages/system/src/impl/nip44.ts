import { MessageEncryptor, MessageEncryptorPayload, MessageEncryptorVersion } from "../index.ts";

import { randomBytes } from "npm:@noble/hashes/utils";
import { streamXOR as xchacha20 } from "npm:@stablelib/xchacha20";
import { secp256k1 } from "npm:@noble/curves/secp256k1";
import { sha256 } from "npm:@noble/hashes/sha256";

export class XChaCha20Encryptor implements MessageEncryptor {
  getSharedSecret(privateKey: string, publicKey: string): Uint8Array {
    const key = secp256k1.getSharedSecret(privateKey, "02" + publicKey);
    return sha256(key.slice(1, 33));
  }

  encryptData(content: string, sharedSecret: Uint8Array): MessageEncryptorPayload {
    const nonce = randomBytes(24);
    const plaintext = new TextEncoder().encode(content);
    const ciphertext = xchacha20(sharedSecret, nonce, plaintext, plaintext);
    return {
      ciphertext: Uint8Array.from(ciphertext),
      nonce: nonce,
      v: MessageEncryptorVersion.XChaCha20,
    } as MessageEncryptorPayload;
  }

  decryptData(payload: MessageEncryptorPayload, sharedSecret: Uint8Array): string {
    if (payload.v !== MessageEncryptorVersion.XChaCha20) throw new Error("NIP44: wrong encryption version");

    const dst = xchacha20(sharedSecret, payload.nonce, payload.ciphertext, payload.ciphertext);
    const decoded = new TextDecoder().decode(dst);
    return decoded;
  }
}
