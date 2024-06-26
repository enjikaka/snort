import { RelayCache } from "../src/outbox-model";
import { RequestBuilder, RequestStrategy } from "../src/request-builder";
import { describe, expect } from "@jest/globals";
import { bytesToHex } from "@noble/curves/abstract/utils";
import { FeedCache, unixNow, unixNowMs } from "npm:@snort/shared@1.0.16";
import { NostrSystem, UsersRelays } from "../src";

const DummyCache = {
  getFromCache: (pk?: string) => {
    if (!pk) return undefined;

    return {
      pubkey: pk,
      created_at: unixNow(),
      relays: [
        {
          url: `wss://${pk}.com/`,
          settings: {
            read: true,
            write: true,
          },
        },
      ],
    };
  },
  update: () => {
    return Promise.resolve<"new" | "updated" | "refresh" | "no_change">("new");
  },
  buffer: () => {
    return Promise.resolve<Array<string>>([]);
  },
  bulkSet: () => {
    return Promise.resolve();
  },
} as unknown as FeedCache<UsersRelays>;

const System = new NostrSystem({
  relayCache: DummyCache,
});

describe("RequestBuilder", () => {
  describe("basic", () => {
    test("empty filter", () => {
      const b = new RequestBuilder("test");
      b.withFilter();
      expect(b.buildRaw()).toEqual([{}]);
    });
    test("only kind", () => {
      const b = new RequestBuilder("test");
      b.withFilter().kinds([0]);
      expect(b.buildRaw()).toMatchObject([{ kinds: [0] }]);
    });
    test("empty authors", () => {
      const b = new RequestBuilder("test");
      b.withFilter().authors([]);
      expect(b.buildRaw()).toMatchObject([{ authors: [] }]);
    });
    test("authors/kinds/ids", () => {
      const authors = ["a1", "a2"];
      const kinds = [0, 1, 2, 3];
      const ids = ["id1", "id2", "id3"];
      const b = new RequestBuilder("test");
      b.withFilter().authors(authors).kinds(kinds).ids(ids);
      expect(b.buildRaw()).toMatchObject([{ ids, authors, kinds }]);
    });
    test("authors and kinds, duplicates removed", () => {
      const authors = ["a1", "a2"];
      const kinds = [0, 1, 2, 3];
      const ids = ["id1", "id2", "id3"];
      const b = new RequestBuilder("test");
      b.withFilter().ids(ids).authors(authors).kinds(kinds).ids(ids).authors(authors).kinds(kinds);
      expect(b.buildRaw()).toMatchObject([{ ids, authors, kinds }]);
    });
    test("search", () => {
      const b = new RequestBuilder("test");
      b.withFilter().kinds([1]).search("test-search");
      expect(b.buildRaw()).toMatchObject([{ kinds: [1], search: "test-search" }]);
    });
    test("timeline", () => {
      const authors = ["a1", "a2"];
      const kinds = [0, 1, 2, 3];
      const until = 10;
      const since = 5;
      const b = new RequestBuilder("test");
      b.withFilter().kinds(kinds).authors(authors).since(since).until(until);
      expect(b.buildRaw()).toMatchObject([{ kinds, authors, until, since }]);
    });
    test("multi-filter timeline", () => {
      const authors = ["a1", "a2"];
      const kinds = [0, 1, 2, 3];
      const until = 10;
      const since = 5;
      const b = new RequestBuilder("test");
      b.withFilter().kinds(kinds).authors(authors).since(since).until(until);
      b.withFilter().kinds(kinds).authors(authors).since(since).until(until);
      expect(b.buildRaw()).toMatchObject([
        { kinds, authors, until, since },
        { kinds, authors, until, since },
      ]);
    });
  });

  describe("diff basic", () => {
    const rb = new RequestBuilder("test");
    const f0 = rb.withFilter();

    const a = rb.buildRaw();
    f0.authors(["a"]);
    expect(a).toEqual([{}]);

    const b = rb.buildDiff(System, a);
    expect(b).toMatchObject([
      {
        filters: [{ authors: ["a"] }],
      },
    ]);
  });

  describe("build gossip simply", () => {
    const rb = new RequestBuilder("test");
    rb.withFilter().authors(["a", "b"]).kinds([0]);

    const a = rb.build(System);
    expect(a).toMatchObject([
      {
        strategy: RequestStrategy.AuthorsRelays,
        relay: "wss://a.com/",
        filters: [
          {
            kinds: [0],
            authors: ["a"],
          },
        ],
      },
      {
        strategy: RequestStrategy.AuthorsRelays,
        relay: "wss://b.com/",
        filters: [
          {
            kinds: [0],
            authors: ["b"],
          },
        ],
      },
    ]);
  });

  describe("build gossip merged similar filters", () => {
    const rb = new RequestBuilder("test");
    rb.withFilter().authors(["a", "b"]).kinds([0]);
    rb.withFilter().authors(["a", "b"]).kinds([10002]);
    rb.withFilter().authors(["a"]).limit(10).kinds([4]);

    const a = rb.build(System);
    expect(a).toMatchObject([
      {
        strategy: RequestStrategy.AuthorsRelays,
        relay: "wss://a.com/",
        filters: [
          {
            kinds: [0, 10002],
            authors: ["a"],
          },
          {
            kinds: [4],
            authors: ["a"],
            limit: 10,
          },
        ],
      },
      {
        strategy: RequestStrategy.AuthorsRelays,
        relay: "wss://b.com/",
        filters: [
          {
            kinds: [0, 10002],
            authors: ["b"],
          },
        ],
      },
    ]);
  });
});
