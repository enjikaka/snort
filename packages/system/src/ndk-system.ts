import { EventEmitter } from "npm:eventemitter3@5.0.1";
import type { QueryLike, SystemConfig, SystemInterface } from "./system.ts";
import type { RelaySettings, SyncCommand } from "./connection.ts";
import type { TaggedNostrEvent, NostrEvent, OkResponse, ReqCommand } from "./nostr.ts";
import type { BuiltRawReqFilter, RequestBuilder } from "./request-builder.ts";
import NDK, {
  type NDKConstructorParams,
  NDKEvent,
  type NDKFilter,
  NDKRelay,
  NDKSubscription,
  NDKRelayStatus,
} from "npm:@nostr-dev-kit/ndk@2.8.2";
import { SystemBase } from "./system-base.ts";
import { type ConnectionPool, type ConnectionType, type ConnectionTypeEvents, DefaultConnectionPool } from "./connection-pool.ts";
import { RelayMetadataLoader } from "./outbox/index.ts";
import { ProfileLoaderService } from "./profile-cache.ts";
import type { RequestRouter } from "./request-router.ts";
import { RelayMetricHandler } from "./relay-metric-handler.ts";
import type { RelayInfo } from "./relay-info.ts";
import { QueryManager } from "./query-manager.ts";
import debug from "npm:debug@4.3.5";

class NDKConnection extends EventEmitter<ConnectionTypeEvents> implements ConnectionType {
  #id: string;
  #settings: RelaySettings;
  #ephemeral: boolean;

  constructor(
    readonly ndk: NDK,
    readonly relay: NDKRelay,
    settings: RelaySettings,
    ephemeral: boolean,
  ) {
    super();
    this.#id = crypto.randomUUID();
    this.#settings = settings;
    this.#ephemeral = ephemeral;
  }

  get id() {
    return this.#id;
  }

  get address() {
    return this.relay.url;
  }

  get settings() {
    return this.#settings;
  }

  set settings(v: RelaySettings) {
    this.#settings = v;
  }

  get ephemeral() {
    return this.#ephemeral;
  }

  get isDown() {
    return this.relay.connectivity.status === NDKRelayStatus.FLAPPING;
  }

  get isOpen() {
    return this.relay.connectivity.status === NDKRelayStatus.CONNECTED;
  }

  info: RelayInfo | undefined;

  async connect() {
    await this.relay.connect();
  }

  close() {
    this.relay.disconnect();
  }

  async publish(ev: NostrEvent, timeout?: number | undefined) {
    const result = await this.relay.publish(new NDKEvent(undefined, ev), timeout);
    return {
      id: ev.id,
      ok: result,
    } as OkResponse;
  }

  request(req: ReqCommand | SyncCommand, _cbSent?: (() => void) | undefined) {
    if (req[0] === "REQ") {
      const id = req[1];
      const filters = req.slice(2) as NDKFilter[];
      const sub = new NDKSubscription(this.ndk, filters);
      sub.on("event", (ev: NDKEvent) => {
        this.emit("event", id, ev.rawEvent() as TaggedNostrEvent);
      });
      sub.on("eose", () => {
        this.emit("eose", id);
      });
      this.relay.subscribe(sub, filters);
    } else if (req[0] === "SYNC") {
      const id = req[1];
      const filters = req.slice(3) as NDKFilter[];
      const sub = new NDKSubscription(this.ndk, filters);
      sub.on("event", (ev: NDKEvent) => {
        this.emit("event", id, ev.rawEvent() as TaggedNostrEvent);
      });
      sub.on("eose", () => {
        this.emit("eose", id);
      });
      this.relay.subscribe(sub, filters);
    }
  }

  closeRequest() {
    // idk..
  }
}

class NDKConnectionPool extends DefaultConnectionPool<NDKConnection> {
  constructor(
    system: SystemInterface,
    readonly ndk: NDK,
  ) {
    super(system, (addr, opt, eph) => {
      const relay = new NDKRelay(addr);

      this.ndk.pool.addRelay(relay);

      return new NDKConnection(this.ndk, relay, opt, eph);
    });
  }
}

export class NDKSystem extends SystemBase implements SystemInterface {
  #log = debug("NDKSystem");
  #ndk: NDK;
  #queryManager: QueryManager;

  readonly profileLoader: ProfileLoaderService;
  readonly relayMetricsHandler: RelayMetricHandler;
  readonly pool: ConnectionPool;
  readonly relayLoader: RelayMetadataLoader;
  readonly requestRouter: RequestRouter | undefined;

  constructor(system: Partial<SystemConfig>, ndk?: NDKConstructorParams) {
    super(system);
    this.#ndk = new NDK(ndk);
    this.profileLoader = new ProfileLoaderService(this, this.profileCache);
    this.relayMetricsHandler = new RelayMetricHandler(this.relayMetricsCache);
    this.relayLoader = new RelayMetadataLoader(this, this.relayCache);
    this.pool = new NDKConnectionPool(this, this.#ndk);
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
    //this.#queryManager.on("change", () => this.emit("change", this.takeSnapshot()));
    this.#queryManager.on("trace", t => {
      this.relayMetricsHandler.onTraceReport(t);
    });
    this.#queryManager.on("request", (subId: string, f: BuiltRawReqFilter) => this.emit("request", subId, f));
  }

  async Init() {
    await this.#ndk.connect();
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

  async ConnectToRelay(address: string, options: RelaySettings): Promise<void> {
    await this.pool.connect(address, options, false);
  }

  ConnectEphemeralRelay(address: string): Promise<ConnectionType | undefined> {
    return this.pool.connect(address, { read: true, write: true }, true);
  }

  DisconnectRelay(address: string): void {
    this.pool.disconnect(address);
  }

  HandleEvent(subId: string, ev: TaggedNostrEvent): void {
    this.emit("event", subId, ev);
  }

  async BroadcastEvent(ev: NostrEvent, cb?: ((rsp: OkResponse) => void) | undefined): Promise<OkResponse[]> {
    return await this.pool.broadcast(ev, cb);
  }

  async WriteOnceToRelay(relay: string, ev: NostrEvent): Promise<OkResponse> {
    return await this.pool.broadcastTo(relay, ev);
  }
}
