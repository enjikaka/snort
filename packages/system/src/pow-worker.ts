import { minePow, NostrPowEvent } from "./pow-util.ts";

export interface PowWorkerMessage {
  id: string;
  cmd: "req" | "rsp";
  event: NostrPowEvent;
  target: number;
}

(globalThis as unknown as Worker).onmessage = ev => {
  const data = ev.data as PowWorkerMessage;
  if (data.cmd === "req") {
    queueMicrotask(() => {
      minePow(data.event, data.target);
      data.cmd = "rsp";
      (globalThis as unknown as Worker).postMessage(data);
    });
  }
};
