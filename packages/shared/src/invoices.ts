import { bytesToHex } from "npm:@noble/hashes@1.4.0/utils";
import { Section, decode as invoiceDecode } from "npm:light-bolt11-decoder@3.1.1";

export interface InvoiceDetails {
  amount?: number;
  expire?: number;
  timestamp?: number;
  description?: string;
  descriptionHash?: string;
  paymentHash?: string;
  expired: boolean;
  pr: string;
}

export function decodeInvoice(pr: string): InvoiceDetails | undefined {
  try {
    const parsed = invoiceDecode(pr);

    const amountSection = parsed.sections.find((a: Section) => a.name === "amount");
    const amount = amountSection ? Number(amountSection.value as number | string) : undefined;

    const timestampSection = parsed.sections.find((a: Section) => a.name === "timestamp");
    const timestamp = timestampSection ? Number(timestampSection.value as number | string) : undefined;

    const expirySection = parsed.sections.find((a: Section) => a.name === "expiry");
    const expire = expirySection ? Number(expirySection.value as number | string) : undefined;
    const descriptionSection = parsed.sections.find((a: Section) => a.name === "description")?.value;
    const descriptionHashSection = parsed.sections.find((a: Section) => a.name === "description_hash")?.value;
    const paymentHashSection = parsed.sections.find((a: Section) => a.name === "payment_hash")?.value;
    const ret = {
      pr,
      amount: amount,
      expire: timestamp && expire ? timestamp + expire : undefined,
      timestamp: timestamp,
      description: descriptionSection as string | undefined,
      descriptionHash: descriptionHashSection
        ? typeof descriptionHashSection === "string"
          ? (descriptionHashSection as string)
          : bytesToHex(descriptionHashSection as Uint8Array)
        : undefined,
      paymentHash: paymentHashSection
        ? typeof paymentHashSection === "string"
          ? (paymentHashSection as string)
          : bytesToHex(paymentHashSection as Uint8Array)
        : undefined,
      expired: false,
    };
    if (ret.expire) {
      ret.expired = ret.expire < new Date().getTime() / 1000;
    }
    return ret;
  } catch (e) {
    console.error(e);
  }
}
