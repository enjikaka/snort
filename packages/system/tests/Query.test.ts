import { Connection } from "../src/index.ts";
import { describe } from "@std/testing";
import { assertEquals } from "@std/assert";
import { Query } from "../src/query.ts";
import { FlatNoteStore } from "../src/note-collection.ts";
import { RequestStrategy } from "../src/request-builder.ts";

describe("query", () => {
  Deno.test("progress", () => {
    const q = new Query("test", "", new FlatNoteStore());
    const opt = {
      read: true,
      write: true,
    };
    const c1 = new Connection("wss://one.com", opt);
    const c2 = new Connection("wss://two.com", opt);
    const c3 = new Connection("wss://three.com", opt);

    const f = {
      relay: "",
      strategy: RequestStrategy.DefaultRelays,
      filters: [
        {
          kinds: [1],
          authors: ["test"],
        },
      ],
    };
    const qt1 = q.sendToRelay(c1, f);
    const qt2 = q.sendToRelay(c2, f);
    const qt3 = q.sendToRelay(c3, f);

    assertEquals(q.progress, 0);
    q.eose(qt1!.id, c1);
    assertEquals(q.progress, 1 / 3);
    q.eose(qt1!.id, c1);
    assertEquals(q.progress, 1 / 3);
    q.eose(qt2!.id, c2);
    assertEquals(q.progress, 2 / 3);
    q.eose(qt3!.id, c3);
    assertEquals(q.progress, 1);

    const qs = {
      relay: "",
      strategy: RequestStrategy.DefaultRelays,
      filters: [
        {
          kinds: [1],
          authors: ["test-sub"],
        },
      ],
    };
    const qt = q.sendToRelay(c1, qs);

    expect(q.progress).toBe(3 / 4);
    q.eose(qt!.id, c1);
    expect(q.progress).toBe(1);
    q.sendToRelay(c2, qs);
    expect(q.progress).toBe(4 / 5);
  });
});
