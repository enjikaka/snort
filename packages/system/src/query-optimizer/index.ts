import { schnorr } from "npm:@noble/curves@1.4.0/secp256k1";
import type { NostrEvent, ReqFilter } from "../nostr.ts";
import { expandFilter } from "./request-expander.ts";
import { flatMerge, mergeSimilar } from "./request-merger.ts";
import { diffFilters } from "./request-splitter.ts";
import { EventExt } from "../event-ext.ts";

export interface FlatReqFilter {
  keys: number;
  ids?: string;
  authors?: string;
  kinds?: number;
  "#e"?: string;
  "#p"?: string;
  "#t"?: string;
  "#d"?: string;
  "#r"?: string;
  search?: string;
  since?: number;
  until?: number;
  limit?: number;
  relay?: string;
  resultSetId: string;
}

export interface Optimizer {
  expandFilter(f: ReqFilter): Array<FlatReqFilter>;
  getDiff(prev: Array<ReqFilter>, next: Array<ReqFilter>): Array<FlatReqFilter>;
  flatMerge(all: Array<FlatReqFilter>): Array<ReqFilter>;
  compress(all: Array<ReqFilter>): Array<ReqFilter>;
  schnorrVerify(ev: NostrEvent): boolean;
}

export const DefaultOptimizer = {
  expandFilter: (f: ReqFilter) => {
    return expandFilter(f);
  },
  getDiff: (prev: Array<ReqFilter>, next: Array<ReqFilter>) => {
    const diff = diffFilters(
      prev.flatMap(a => expandFilter(a)),
      next.flatMap(a => expandFilter(a)),
    );
    return diff.added;
  },
  flatMerge: (all: Array<FlatReqFilter>) => {
    return flatMerge(all);
  },
  compress: (all: Array<ReqFilter>) => {
    return mergeSimilar(all);
  },
  schnorrVerify: ev => {
    const id = EventExt.createId(ev);
    return schnorr.verify(ev.sig, id, ev.pubkey);
  },
} as Optimizer;
