import { distance } from "jsr:@enjikaka/snort-shared@^1.3.8";
import type { ReqFilter } from "../index.ts";
import type { FlatReqFilter } from "./index.ts";

export function canMergeFilters(a: FlatReqFilter | ReqFilter, b: FlatReqFilter | ReqFilter): boolean {
  if (a.resultSetId !== b.resultSetId) {
    return false;
  }
  return distance(a, b) <= 1;
}

export function mergeSimilar(filters: Array<ReqFilter>): Array<ReqFilter> {
  const ret = [];

  const fCopy = [...filters];
  while (fCopy.length > 0) {
    const current = fCopy.shift()!;
    const mergeSet = [current];
    for (let i = 0; i < fCopy.length; i++) {
      const f = fCopy[i];
      if (!mergeSet.some(v => !canMergeFilters(v, f))) {
        mergeSet.push(fCopy.splice(i, 1)[0]);
        i--;
      }
    }
    ret.push(simpleMerge(mergeSet));
  }
  return ret;
}

/**
 * Simply flatten all filters into one
 * @param filters
 * @returns
 */
export function simpleMerge(filters: Array<ReqFilter>) {
  const result: Partial<ReqFilter> = {};

  filters.forEach(filter => {
    Object.entries(filter).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        if (result[key] === undefined) {
          // @ts-expect-error: Typing hard
          result[key] = [...value];
        } else {
          // @ts-expect-error: Typing hard
          const toAdd = value.filter(a => !result[key].includes(a));
          // @ts-expect-error: Typing hard
          result[key].push(...toAdd);
        }
      } else {
        result[key] = value;
      }
    });
  });

  return result as ReqFilter;
}

/**
 * Check if a filter includes another filter, as in the bigger filter will include the same results as the samller filter
 * @param bigger
 * @param smaller
 * @returns
 */
export function filterIncludes(bigger: ReqFilter, smaller: ReqFilter) {
  const outside = bigger as Record<string, Array<string | number> | number>;
  for (const [k, v] of Object.entries(smaller)) {
    if (outside[k] === undefined) {
      return false;
    }
    if (Array.isArray(v) && v.some(a => !(outside[k] as Array<string | number>).includes(a))) {
      return false;
    }
    if (typeof v === "number") {
      if (k === "since" && (outside[k] as number) > v) {
        return false;
      }
      if (k === "until" && (outside[k] as number) < v) {
        return false;
      }
      // limit cannot be checked and is ignored
    }
  }
  return true;
}

/**
 * Merge expanded flat filters into combined concise filters
 * @param all
 * @returns
 */
export function flatMerge(all: Array<FlatReqFilter>): Array<ReqFilter> {
  let ret: Array<ReqFilter> = [];

  // to compute filters which can be merged we need to calucate the distance change between each filter
  // then we can merge filters which are exactly 1 change diff from each other
  function mergeFiltersInSet(filters: Array<FlatReqFilter>) {
    return filters.reduce((acc, a) => {
      Object.entries(a).forEach(([k, v]) => {
        if (v === undefined) return;
        if (k === "since" || k === "until" || k === "limit" || k === "search" || k === "resultSetId") {
          acc[k] = v;
        } else {
          acc[k] ??= [];
          const acck = acc[k];
          if (acck && Array.isArray(acck)) {
            if (k === 'kinds') {
              (acck as Array<number>).push(v as number);
            } else {
              (acck as Array<string>).push(v as string);
            }
          }
        }
      });
      return acc;
    }, {} as Partial<ReqFilter>) as ReqFilter;
  }

  // reducer, kinda verbose
  while (all.length > 0) {
    const currentFilter = all.shift()!;
    const mergeSet = [currentFilter];

    for (let i = 0; i < all.length; i++) {
      const f = all[i];

      if (mergeSet.every(a => canMergeFilters(a, f))) {
        mergeSet.push(all.splice(i, 1)[0]);
        i--;
      }
    }
    ret.push(mergeFiltersInSet(mergeSet));
  }

  while (true) {
    const n = mergeSimilar([...ret]);
    if (n.length === ret.length) {
      break;
    }
    ret = n;
  }
  ret.forEach(a => delete a["resultSetId"]);
  return ret;
}
