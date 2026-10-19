// The serialised write queue for Gantt charts: one promise chain per chart id,
// so every read-modify-write of one chart is atomic, with the changelog entry
// appended inside the same critical section.
//
// Why a queue at all, and why this one. A chart is the **system of record** for
// the plan (ADR-0012 §1), and the exception that makes it one is paid for in
// three named parts — validation at the boundary (§9), serialised writes (§8),
// and the audit trail (§11). This module is the second of the three. The store
// is one local process, so a per-chart queue makes read-modify-write atomic for
// almost nothing: two agents touching different nodes of one chart both simply
// succeed, with no version token, no `If-Match`, and no retry loop for a SKILL
// to get wrong (§8 records the whole-chart `PUT` alternatives and why each one
// either loses work or spins).
//
// Plain dependency-injected module, in the shape `explain-runs.ts` establishes:
// process state, an injected clock, an injected store, no Effect. The Effect
// half lives one layer up in `server/contexts/gantt/application/`, which is what
// both the REST routes and the UI's server functions call.

import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import {
  appendChartChangelog,
  type GanttChangelogActor,
  type GanttChangelogStoreDeps,
} from './gantt-changelog-store'
import { bodyFilePath, bodyPrevFilePath, type GanttStoreDeps } from './gantt-store'

/**
 * The store's deps plus the one verb the store deliberately does not have.
 *
 * `gantt-store.ts` says of itself that "nothing in this module deletes
 * anything", and that is a property worth keeping: it is the module that owns
 * the only copy of a PRD. But `DELETE /nodes/:nodeId` does have to remove the
 * deleted node's body and its `.prev` — a body file left behind would make
 * `hasBody` true for a node that no longer exists. So the erase lives **here**,
 * beside the lock that makes it atomic with the chart write, and reaches the
 * right paths through the store's own exported path builders.
 */
export type GanttWritesDeps = GanttStoreDeps &
  GanttChangelogStoreDeps & {
    /** Removes one file. A missing file is not an error — see `deleteBodyFiles`. */
    deleteFile: (path: string) => Promise<void>
  }

export type GanttWrites = {
  readonly deps: GanttWritesDeps
  /**
   * Run `critical` with exclusive access to one chart.
   *
   * Two guarantees, and the second is as load-bearing as the first:
   * concurrent calls for the **same** chart id run one after another, and calls
   * for **different** chart ids do not wait on each other. A global lock would
   * be correct and would also make one agent's slow write block every other
   * chart in the process, which is the scenario the feature exists to support.
   */
  readonly withChartLock: <A>(chartId: string, critical: () => Promise<A>) => Promise<A>
}

export function createGanttWrites(deps: GanttWritesDeps): GanttWrites {
  // One promise chain per chart id. The map *is* the queue: the value is the
  // promise a new write waits on, and replacing it is how the queue advances.
  // Nothing in here is keyed globally, which is precisely why different charts
  // do not serialise.
  const tails = new Map<string, Promise<void>>()

  const withChartLock = <A>(chartId: string, critical: () => Promise<A>): Promise<A> => {
    const previous = tails.get(chartId) ?? Promise.resolve()
    // `.then(critical, critical)` rather than `.then(critical)`: a write that
    // failed must not wedge its chart's queue, so the next writer runs whichever
    // way the previous one ended. The previous writer's rejection is already
    // swallowed by `tail` below, so this is belt and braces.
    const result = previous.then(critical, critical)
    // The queue holds a *settled-either-way* copy. Without this the map would
    // hold a rejected promise nobody awaits, which Node reports as an unhandled
    // rejection even though the caller is handling it on `result`.
    const tail = result.then(
      () => {},
      () => {},
    )
    tails.set(chartId, tail)
    void tail.then(() => {
      // Drop the entry once this write was the last one queued, so the map does
      // not grow one permanent key per chart the process ever touched. If
      // another write queued meanwhile it owns the slot, and deleting would
      // break the chain it is waiting on.
      if (tails.get(chartId) === tail) tails.delete(chartId)
    })
    return result
  }

  return { deps, withChartLock }
}

/**
 * Append one changelog entry. Called **inside** a `withChartLock` critical
 * section, alongside the chart write it describes, which is what makes "one
 * entry per write, and never an entry for a write that did not land" true
 * rather than merely intended (ADR-0012 §11).
 */
export async function recordChange(
  writes: GanttWrites,
  chartId: string,
  actor: GanttChangelogActor,
  summary: string,
): Promise<void> {
  await appendChartChangelog(chartId, { at: writes.deps.now(), actor, summary }, writes.deps)
}

/**
 * Remove a node's body and its one level of undo. Both, and in that order: a
 * `.prev` outliving the body it was a predecessor of is a snapshot of nothing.
 *
 * A missing file is the ordinary case — most nodes have no body at all — so
 * each removal swallows its own failure rather than the caller having to know
 * which of the two files existed.
 */
export async function deleteBodyFiles(
  writes: GanttWrites,
  chartId: string,
  nodeId: string,
): Promise<void> {
  for (const path of [
    bodyFilePath(writes.deps.homeDir, chartId, nodeId),
    bodyPrevFilePath(writes.deps.homeDir, chartId, nodeId),
  ]) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- two local files, in order
      await writes.deps.deleteFile(path)
    } catch {
      // Not there, which is what "this node had no body" looks like on disk.
    }
  }
}

// ---------------------------------------------------------------------------
// The live instance
// ---------------------------------------------------------------------------

export function liveGanttWritesDeps(): GanttWritesDeps {
  return {
    homeDir: homedir(),
    readFile: (path) => readFile(path, 'utf8'),
    writeFile: (path, data) => writeFile(path, data, 'utf8'),
    mkdir: async (path) => {
      await mkdir(path, { recursive: true })
    },
    readDir: (path) => readdir(path),
    rename: (from, to) => rename(from, to),
    deleteFile: (path) => rm(path),
    now: () => new Date().toISOString(),
  }
}

// Pinned on `globalThis` for the reason `explain-registry.ts` gives: in dev,
// Vite can re-evaluate a server module, and two queues would be worse than none
// — each chart would have two chains that know nothing about each other, so the
// atomicity this module exists to provide would be silently gone while every
// test still passed. One queue per process, whatever the module graph does.
//
// Nine route files import this, which is the other half of the reason: a
// module-local singleton would already be per-module if any of them were ever
// bundled separately.
const WRITES_KEY = '__clashboardGanttWrites'

type WritesHost = typeof globalThis & { [WRITES_KEY]?: GanttWrites }

/**
 * The one live write queue, with its real dependencies wired in. Built on first
 * call rather than at module load so importing this module touches neither the
 * clock nor the home directory.
 */
export function liveGanttWrites(): GanttWrites {
  const host = globalThis as WritesHost
  host[WRITES_KEY] ??= createGanttWrites(liveGanttWritesDeps())
  return host[WRITES_KEY]
}
