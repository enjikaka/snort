import type { CachedTable } from "jsr:@enjikaka/snort-shared@^1.3.8";
import type { UsersRelays, CachedMetadata, RelayMetrics, UsersFollows, SnortSystemDb } from "./cache/index.ts";
import type { CacheRelay } from "./cache-relay.ts";
import type { RelaySettings } from "./connection.ts";
import type { ConnectionPool } from "./connection-pool.ts";
import type { TaggedNostrEvent, OkResponse, ReqFilter, NostrEvent } from "./nostr.ts";
import type { AuthorsRelaysCache, RelayMetadataLoader } from "./outbox/index.ts";
import type { ProfileLoaderService } from "./profile-cache.ts";
import type { Optimizer } from "./query-optimizer/index.ts";
import type { BuiltRawReqFilter, RequestBuilder } from "./request-builder.ts";
import type { RequestRouter } from "./request-router.ts";
import type { QueryEvents } from "./query.ts";
import type { EventEmitter } from "npm:eventemitter3@5.0.1";

export type QueryLike = {
  get progress(): number;
  feed: {
    add: (evs: Array<TaggedNostrEvent>) => void;
    clear: () => void;
  };
  cancel: () => void;
  uncancel: () => void;
  get snapshot(): Array<TaggedNostrEvent>;
} & EventEmitter<QueryEvents>;

export interface NostrSystemEvents {
  change: (state: SystemSnapshot) => void;
  auth: (challenge: string, relay: string, cb: (ev: NostrEvent) => void) => void;
  event: (subId: string, ev: TaggedNostrEvent) => void;
  request: (subId: string, filter: BuiltRawReqFilter) => void;
}

export interface SystemConfig {
  /**
   * Users configured relays (via kind 3 or kind 10_002)
   */
  relays: CachedTable<UsersRelays>;

  /**
   * Cache of user profiles, (kind 0)
   */
  profiles: CachedTable<CachedMetadata>;

  /**
   * Cache of relay connection stats
   */
  relayMetrics: CachedTable<RelayMetrics>;

  /**
   * Direct reference events cache
   */
  events: CachedTable<NostrEvent>;

  /**
   * Cache of user ContactLists (kind 3)
   */
  contactLists: CachedTable<UsersFollows>;

  /**
   * Optimized cache relay, usually `@snort/worker-relay`
   */
  cachingRelay?: CacheRelay;

  /**
   * Optimized functions, usually `@snort/system-wasm`
   */
  optimizer: Optimizer;

  /**
   * Dexie database storage, usually `@snort/system-web`
   */
  db?: SnortSystemDb;

  /**
   * Check event sigs on receive from relays
   */
  checkSigs: boolean;

  /**
   * Automatically handle outbox model
   *
   * 1. Fetch relay lists automatically for queried authors
   * 2. Write to inbox for all `p` tagged users in broadcasting events
   */
  automaticOutboxModel: boolean;

  /**
   * Automatically populate SocialGraph from kind 3 events fetched.
   *
   * This is basically free because we always load relays (which includes kind 3 contact lists)
   * for users when fetching by author.
   */
  buildFollowGraph: boolean;

  /**
   * Pick a fallback sync method when negentropy is not available
   */
  fallbackSync: "since" | "range-sync";
}

export interface SystemInterface {
  /**
   * Check event signatures (reccomended)
   */
  checkSigs: boolean;

  /**
   * Do some initialization
   * @param follows A follower list to preload content for
   */
  Init(follows?: Array<string>): Promise<void>;

  /**
   * Get an active query by ID
   * @param id Query ID
   */
  GetQuery(id: string): QueryLike | undefined;

  /**
   * Open a new query to relays
   * @param req Request to send to relays
   */
  Query(req: RequestBuilder): QueryLike;

  /**
   * Fetch data from nostr relays asynchronously
   * @param req Request to send to relays
   * @param cb A callback which will fire every 100ms when new data is received
   */
  Fetch(req: RequestBuilder, cb?: (evs: Array<TaggedNostrEvent>) => void): Promise<Array<TaggedNostrEvent>>;

  /**
   * Create a new permanent connection to a relay
   * @param address Relay URL
   * @param options Read/Write settings
   */
  ConnectToRelay(address: string, options: RelaySettings): Promise<void>;

  /**
   * Disconnect permanent relay connection
   * @param address Relay URL
   */
  DisconnectRelay(address: string): void;

  /**
   * Push an event into the system from external source
   */
  HandleEvent(subId: string, ev: TaggedNostrEvent): void;

  /**
   * Send an event to all permanent connections
   * @param ev Event to broadcast
   * @param cb Callback to handle OkResponse as they arrive
   */
  BroadcastEvent(ev: NostrEvent, cb?: (rsp: OkResponse) => void): Promise<Array<OkResponse>>;

  /**
   * Connect to a specific relay and send an event and wait for the response
   * @param relay Relay URL
   * @param ev Event to send
   */
  WriteOnceToRelay(relay: string, ev: NostrEvent): Promise<OkResponse>;

  /**
   * Profile cache/loader
   */
  get profileLoader(): ProfileLoaderService;

  /**
   * Relay cache for "Gossip" model
   */
  get relayCache(): AuthorsRelaysCache;

  /**
   * Query optimizer
   */
  get optimizer(): Optimizer;

  /**
   * Generic cache store for events
   */
  get eventsCache(): CachedTable<NostrEvent>;

  /**
   * ContactList cache
   */
  get userFollowsCache(): CachedTable<UsersFollows>;

  /**
   * Relay loader loads relay metadata for a set of profiles
   */
  get relayLoader(): RelayMetadataLoader;

  /**
   * Main connection pool
   */
  get pool(): ConnectionPool;

  /**
   * Local relay cache service
   */
  get cacheRelay(): CacheRelay | undefined;

  /**
   * Request router instance
   */
  get requestRouter(): RequestRouter | undefined;

  get config(): SystemConfig;
}

export interface SystemSnapshot {
  queries: Array<{
    id: string;
    filters: Array<ReqFilter>;
    subFilters: Array<ReqFilter>;
  }>;
}
