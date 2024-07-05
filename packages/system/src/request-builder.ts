import debug from "npm:debug@4.3.5";
import { appendDedupe, dedupe, removeUndefined, sanitizeRelayUrl, unixNowMs, unwrap } from "jsr:@enjikaka/snort-shared@1.3.7";

import type EventKind from "./event-kind.ts";
import { type FlatReqFilter, type NostrLink, NostrPrefix, type SystemInterface, type ToNostrEventTag } from "./index.ts";
import type { ReqFilter, u256, HexKey, TaggedNostrEvent } from "./nostr.ts";
import type { RequestRouter } from "./request-router.ts";

/**
 * A built REQ filter ready for sending to System
 */
export interface BuiltRawReqFilter {
  filters: Array<ReqFilter>;
  relay: string;
  // Use set sync from an existing set of events
  syncFrom?: Array<TaggedNostrEvent>;
}

export interface RequestBuilderOptions {
  /**
   * Dont send CLOSE directly after EOSE and allow events to stream in
   */
  leaveOpen?: boolean;

  /**
   * Do not apply diff logic and always use full filters for query
   */
  skipDiff?: boolean;

  /**
   * Pick N relays per pubkey when using outbox strategy
   */
  outboxPickN?: number;

  /**
   * Max wait time for this request
   */
  timeout?: number;

  /**
   * How many milli-seconds to wait to allow grouping
   */
  groupingDelay?: number;

  /**
   * If events should be added automatically to the internal NoteCollection
   * default=true
   */
  fillStore?: boolean;
}

/**
 * Nostr REQ builder
 */
export class RequestBuilder {
  id: string;
  instance: string;
  #builders: Array<RequestFilterBuilder>;
  #options?: RequestBuilderOptions;
  #log = debug("RequestBuilder");
  #rawCached?: Array<ReqFilter>;

  constructor(id: string) {
    this.instance = crypto.randomUUID();
    this.id = id;
    this.#builders = [];
  }

  get numFilters(): number {
    return this.#builders.length;
  }

  get filterBuilders(): RequestFilterBuilder[] {
    return this.#builders;
  }

  get options(): RequestBuilderOptions | undefined {
    return this.#options;
  }

  /**
   * Add another request builders filters to this one
   */
  add(other: RequestBuilder): void {
    this.#builders.push(...other.#builders);
    this.#rawCached = undefined;
  }

  withFilter(): RequestFilterBuilder {
    const ret = new RequestFilterBuilder();
    this.#builders.push(ret);
    this.#rawCached = undefined;
    return ret;
  }

  withBareFilter(f: ReqFilter): RequestFilterBuilder {
    const ret = new RequestFilterBuilder(f);
    this.#builders.push(ret);
    this.#rawCached = undefined;
    return ret;
  }

  withOptions(opt: RequestBuilderOptions): this {
    this.#options = {
      ...this.#options,
      ...opt,
    };
    return this;
  }

  buildRaw(system?: SystemInterface): Array<ReqFilter> {
    if (!this.#rawCached && system) {
      this.#rawCached = system.optimizer.compress(this.#builders.map(f => f.filter));
    }
    return this.#rawCached ?? this.#builders.map(f => f.filter);
  }

  build(system: SystemInterface): Array<BuiltRawReqFilter> {
    let rawFilters = this.buildRaw(system);
    if (system.requestRouter) {
      rawFilters = system.requestRouter.forAllRequest(rawFilters);
    }
    const expanded = rawFilters.flatMap(a => system.optimizer.expandFilter(a));
    return this.#groupFlatByRelay(system, expanded);
  }

  /**
   * Detects a change in request from a previous set of filters
   */
  buildDiff(system: SystemInterface, prev: Array<ReqFilter>): Array<BuiltRawReqFilter> {
    const start = unixNowMs();

    let rawFilters = this.buildRaw(system);
    if (system.requestRouter) {
      rawFilters = system.requestRouter.forAllRequest(rawFilters);
    }
    const diff = system.optimizer.getDiff(prev, rawFilters);
    if (diff.length > 0) {
      const ret = this.#groupFlatByRelay(system, diff);
      const ts = unixNowMs() - start;
      if (ts >= 100) {
        this.#log("slow diff %s %d ms, consider separate query ids, or use skipDiff: %O", this.id, ts, prev);
      }
      return ret;
    }
    return [];
  }

  #groupFlatByRelay(system: SystemInterface, filters: Array<FlatReqFilter>) {
    const relayMerged = filters.reduce((acc, v) => {
      const relay = v.relay ?? "";
      // delete relay from filter
      delete v.relay;
      const existing = acc.get(relay);
      if (existing) {
        existing.push(v);
      } else {
        acc.set(relay, [v]);
      }
      return acc;
    }, new Map<string, Array<FlatReqFilter>>());

    const ret = [];
    for (const [k, v] of relayMerged.entries()) {
      const filters = system.optimizer.flatMerge(v);
      ret.push({
        relay: k,
        filters,
      } as BuiltRawReqFilter);
    }
    return ret;
  }
}

/**
 * Builder class for a single request filter
 */
export class RequestFilterBuilder {
  #filter: ReqFilter;

  constructor(f?: ReqFilter) {
    this.#filter = f ?? {};
  }

  get filter(): ReqFilter {
    return {
      ...this.#filter,
    };
  }

  /**
   * Use a specific relay for this request filter
   */
  relay(u: string | Array<string>): this {
    const relays = Array.isArray(u) ? u : [u];
    this.#filter.relays = appendDedupe(this.#filter.relays, removeUndefined(relays.map(a => sanitizeRelayUrl(a))));
    // make sure we dont have an empty array
    if (this.#filter.relays?.length === 0) {
      this.#filter.relays = undefined;
    }
    return this;
  }

  ids(ids: Array<u256>): this {
    this.#filter.ids = appendDedupe(this.#filter.ids, ids);
    return this;
  }

  authors(authors?: Array<HexKey>): this {
    if (!authors) return this;
    this.#filter.authors = appendDedupe(this.#filter.authors, authors);
    this.#filter.authors = this.#filter.authors.filter(a => a.length === 64);
    return this;
  }

  kinds(kinds?: Array<EventKind>): this {
    if (!kinds) return this;
    this.#filter.kinds = appendDedupe(this.#filter.kinds, kinds);
    return this;
  }

  since(since?: number): this {
    if (!since) return this;
    this.#filter.since = since;
    return this;
  }

  until(until?: number): this {
    if (!until) return this;
    this.#filter.until = until;
    return this;
  }

  limit(limit?: number): this {
    if (!limit) return this;
    this.#filter.limit = limit;
    return this;
  }

  tag(key: "e" | "p" | "d" | "t" | "r" | "a" | "g" | string, value?: Array<string>): this {
    if (!value) return this;
    this.#filter[`#${key}`] = appendDedupe(this.#filter[`#${key}`] as Array<string>, value);
    return this;
  }

  /**
   * Query by a nostr tag
   */
  tags(tags: Array<ToNostrEventTag>): this {
    for (const tag of tags) {
      const tt = tag.toEventTag();
      if (tt) {
        this.tag(tt[0], [tt[1]]);
      }
    }
    return this;
  }

  search(keyword?: string): this {
    if (!keyword) return this;
    this.#filter.search = keyword;
    return this;
  }

  /**
   * Get event from link
   */
  link(link: NostrLink): this {
    if (link.type === NostrPrefix.Address) {
      this.tag("d", [link.id])
        .kinds([unwrap(link.kind)])
        .authors([unwrap(link.author)]);
    } else {
      if (link.id) {
        this.ids([link.id]);
      }
      if (link.author) {
        this.authors([link.author]);
      }
      if (link.kind !== undefined) {
        this.kinds([link.kind]);
      }
    }
    link.relays?.forEach(v => this.relay(v));
    return this;
  }

  /**
   * Get replies to link with e/a tags
   */
  replyToLink(links: Array<NostrLink>): this {
    const types = dedupe(links.map(a => a.type));
    if (types.length > 1) throw new Error("Cannot add multiple links of different kinds");

    const tags = removeUndefined(links.map(a => a.toEventTag()));
    this.tag(
      tags[0][0],
      tags.map(v => v[1]),
    );
    this.relay(removeUndefined(links.map(a => a.relays).flat()));
    return this;
  }

  /**
   * Build/expand this filter into a set of relay specific queries
   */
  build(model?: RequestRouter, options?: RequestBuilderOptions): Array<ReqFilter> {
    if (model) {
      return model.forRequest(this.filter, options?.outboxPickN);
    }

    return [this.filter];
  }
}
