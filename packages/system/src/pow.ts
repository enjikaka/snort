import type { NostrEvent } from "./nostr.ts";
import type { PowWorkerMessage } from "./pow-worker.ts";

export interface PowMiner {
  minePow(ev: NostrEvent, target: number): Promise<NostrEvent>;
}

interface PowQueue {
  resolve: (ev: NostrEvent) => void;
  reject: () => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class PowWorker implements PowMiner {
  #worker: Worker;
  #queue: Map<string, PowQueue> = new Map();

  constructor(workerPath: string) {
    this.#worker = new Worker(workerPath, {
      type: "module",
      name: "POW",
    });
    this.#worker.onerror = ev => {
      console.error(ev);
    };
    this.#worker.onmessage = ev => {
      const data = ev.data as PowWorkerMessage;
      const job = this.#queue.get(data.id);
      if (job) {
        clearTimeout(job.timeout);
        this.#queue.delete(data.id);
        job.resolve(data.event);
      }
    };
  }

  minePow(ev: NostrEvent, target: number): Promise<NostrEvent> {
    return new Promise<NostrEvent>((resolve, reject) => {
      const req = {
        id: crypto.randomUUID(),
        cmd: "req",
        event: ev,
        target,
      } as PowWorkerMessage;
      this.#queue.set(req.id, {
        resolve: ex => resolve(ex),
        reject,
        timeout: setTimeout(() => {
          this.#queue.delete(req.id);
          reject();
        }, 600_000),
      });
      this.#worker.postMessage(req);
    });
  }
}
