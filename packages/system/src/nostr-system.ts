import debug from "npm:debug@4.3.5";

import { unixNowMs } from "@enjikaka/snort-shared";
import { NostrEvent, TaggedNostrEvent, OkResponse } from "./nostr.ts";
import { RelaySettings } from "./connection.ts";
import { BuiltRawReqFilter, RequestBuilder } from "./request-builder.ts";
import { RelayMetricHandler } from "./relay-metric-handler.ts";
import { ProfileLoaderService } from "./profile-cache.ts";
import {
  SystemInterface,
  SystemSnapshot,
  QueryLike,
  OutboxModel,
  socialGraphInstance,
  EventKind,
  ID,
  SystemConfig,
} from "./index.ts";
import { RelayMetadataLoader } from "./outbox/index.ts";
import { ConnectionPool, ConnectionType, DefaultConnectionPool } from "./connection-pool.ts";
import { QueryManager } from "./query-manager.ts";
import { RequestRouter } from "./request-router.ts";
import { SystemBase } from "./system-base.ts";

/**
 * Manages nostr content retrieval system
 */
export class NostrSystem extends SystemBase implements SystemInterface {
  #log = debug("System");
  #queryManager: QueryManager;

  readonly profileLoader: ProfileLoaderService;
  readonly relayMetricsHandler: RelayMetricHandler;
  readonly pool: ConnectionPool;
  readonly relayLoader: RelayMetadataLoader;
  readonly requestRouter: RequestRouter | undefined;

  constructor(props: Partial<SystemConfig>) {
    super(props);

    this.profileLoader = new ProfileLoaderService(this, this.profileCache);
    this.relayMetricsHandler = new RelayMetricHandler(this.relayMetricsCache);
    this.relayLoader = new RelayMetadataLoader(this, this.relayCache);

    // if automatic outbox model, setup request router as OutboxModel
    if (this.config.automaticOutboxModel) {
      this.requestRouter = OutboxModel.fromSystem(this);
    }

    // Cache everything
    if (this.config.cachingRelay) {
      this.on("event", async (_, ev) => {
        await this.config.cachingRelay?.event(ev);
      });
    }

    // Hook on-event when building follow graph
    if (this.config.buildFollowGraph) {
      let evBuf: Array<TaggedNostrEvent> = [];
      let t: ReturnType<typeof setTimeout> | undefined;
      this.on("event", (_, ev) => {
        if (ev.kind === EventKind.ContactList) {
          // fire&forget update
          this.userFollowsCache.update({
            loaded: unixNowMs(),
            created: ev.created_at,
            pubkey: ev.pubkey,
            follows: ev.tags,
          });

          // buffer social graph updates into 500ms window
          evBuf.push(ev);
          if (!t) {
            t = setTimeout(() => {
              socialGraphInstance.handleEvent(evBuf);
              evBuf = [];
            }, 500);
          }
        }
      });
    }

    this.pool = new DefaultConnectionPool(this);
    this.#queryManager = new QueryManager(this);

    // hook connection pool
    this.pool.on("connected", (id, wasReconnect) => {
      const c = this.pool.getConnection(id);
      if (c) {
        this.relayMetricsHandler.onConnect(c.address);
        if (wasReconnect) {
          for (const [, q] of this.#queryManager) {
            q.connectionRestored(c);
          }
        }
      }
    });
    this.pool.on("connectFailed", address => {
      this.relayMetricsHandler.onDisconnect(address, 0);
    });
    this.pool.on("event", (_, sub, ev) => {
      ev.relays?.length && this.relayMetricsHandler.onEvent(ev.relays[0]);
      this.emit("event", sub, ev);
    });
    this.pool.on("disconnect", (id, code) => {
      const c = this.pool.getConnection(id);
      if (c) {
        this.relayMetricsHandler.onDisconnect(c.address, code);
        for (const [, q] of this.#queryManager) {
          q.connectionLost(c.id);
        }
      }
    });
    this.pool.on("auth", (_, c, r, cb) => this.emit("auth", c, r, cb));
    this.pool.on("notice", (addr, msg) => {
      this.#log("NOTICE: %s %s", addr, msg);
    });
    this.#queryManager.on("change", () => this.emit("change", this.takeSnapshot()));
    this.#queryManager.on("trace", t => {
      this.relayMetricsHandler.onTraceReport(t);
    });
    this.#queryManager.on("request", (subId: string, f: BuiltRawReqFilter) => this.emit("request", subId, f));
  }

  async Init(follows?: Array<string>) {
    const t = [
      this.relayCache.preload(follows),
      this.profileCache.preload(follows),
      this.relayMetricsCache.preload(follows),
      this.eventsCache.preload(follows),
      this.userFollowsCache.preload(follows),
    ];
    await Promise.all(t);
    await this.PreloadSocialGraph();
  }

  async PreloadSocialGraph() {
    // Insert data to socialGraph from cache
    if (this.config.buildFollowGraph) {
      for (const list of this.userFollowsCache.snapshot()) {
        const user = ID(list.pubkey);
        for (const fx of list.follows) {
          if (fx[0] === "p" && fx[1]?.length === 64) {
            socialGraphInstance.addFollower(ID(fx[1]), user);
          }
        }
      }
    }
  }

  async ConnectToRelay(address: string, options: RelaySettings): Promise<void> {
    await this.pool.connect(address, options, false);
  }

  ConnectEphemeralRelay(address: string): Promise<ConnectionType | undefined> {
    return this.pool.connect(address, { read: true, write: true }, true);
  }

  DisconnectRelay(address: string) {
    this.pool.disconnect(address);
  }

  GetQuery(id: string): QueryLike | undefined {
    return this.#queryManager.get(id);
  }

  Fetch(req: RequestBuilder, cb?: (evs: Array<TaggedNostrEvent>) => void): Promise<TaggedNostrEvent[]> {
    return this.#queryManager.fetch(req, cb);
  }

  Query(req: RequestBuilder): QueryLike {
    return this.#queryManager.query(req);
  }

  HandleEvent(subId: string, ev: TaggedNostrEvent) {
    this.emit("event", subId, ev);
    this.#queryManager.handleEvent(ev);
  }

  async BroadcastEvent(ev: NostrEvent, cb?: (rsp: OkResponse) => void): Promise<OkResponse[]> {
    this.HandleEvent("*", { ...ev, relays: [] });
    return await this.pool.broadcast(ev, cb);
  }

  async WriteOnceToRelay(address: string, ev: NostrEvent): Promise<OkResponse> {
    return await this.pool.broadcastTo(address, ev);
  }

  takeSnapshot(): SystemSnapshot {
    return {
      queries: [...this.#queryManager].map(([, a]) => {
        return {
          id: a.id,
          filters: a.filters,
          subFilters: [],
        };
      }),
    };
  }
}
