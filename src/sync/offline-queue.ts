/**
 * Generic offline operation queue backed by MMKV.
 *
 * Design principles:
 *  - Operations are persisted immediately on enqueue (survives app crash).
 *  - Flush processes operations FIFO; stops on first failure (preserves ordering).
 *  - Each operation carries a retry count for backoff / dead-letter decisions.
 *  - Callers provide a `processor` function that performs the actual network call.
 *
 * Usage:
 *   const queue = createOfflineQueue<CapturePayload>({
 *     namespace: 'notes:capture',
 *     processor: async (op) => { await apiCall(op.payload); },
 *   });
 *   queue.enqueue({ text: 'hello' });
 *   const flushed = await queue.flush();
 */
import { storage } from '../storage/mmkv';

// ── Types ───────────────────────────────────────────────────

export interface QueuedOperation<T> {
  id: string;
  payload: T;
  createdAt: number;
  retryCount: number;
}

export type OperationProcessor<T> = (operation: QueuedOperation<T>) => Promise<void>;

export interface OfflineQueueOptions<T> {
  /** Unique namespace prefix for MMKV keys (e.g. 'notes:capture'). */
  namespace: string;
  /** Async function that processes a single operation. Throw to signal failure. */
  processor: OperationProcessor<T>;
  /** Max retries before marking as dead-letter. Default: 5. */
  maxRetries?: number;
}

export interface OfflineQueue<T> {
  /** Add an operation to the queue. Returns the operation ID. */
  enqueue: (payload: T) => string;
  /** Process all pending operations in FIFO order. Returns count of successfully processed. */
  flush: () => Promise<number>;
  /** Get count of pending operations. */
  pendingCount: () => number;
  /** Get all pending operations (for display). */
  pending: () => QueuedOperation<T>[];
  /** Remove a specific operation by ID (e.g. user cancelled). */
  remove: (operationId: string) => void;
  /** Clear all pending operations. */
  clear: () => void;
}

// ── Implementation ──────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseJson<R>(raw: string | undefined): R | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as R;
  } catch {
    return null;
  }
}

export function createOfflineQueue<T>(options: OfflineQueueOptions<T>): OfflineQueue<T> {
  const { namespace, processor, maxRetries = 5 } = options;
  const idsKey = `${namespace}:ids`;
  const opPrefix = `${namespace}:op:`;

  function readIds(): string[] {
    return parseJson<string[]>(storage.getString(idsKey)) ?? [];
  }

  function writeIds(ids: string[]): void {
    storage.set(idsKey, JSON.stringify(ids));
  }

  function opStorageKey(id: string): string {
    return `${opPrefix}${id}`;
  }

  function readOp(id: string): QueuedOperation<T> | null {
    return parseJson<QueuedOperation<T>>(storage.getString(opStorageKey(id)));
  }

  function writeOp(op: QueuedOperation<T>): void {
    storage.set(opStorageKey(op.id), JSON.stringify(op));
  }

  function deleteOp(id: string): void {
    storage.delete(opStorageKey(id));
  }

  const queue: OfflineQueue<T> = {
    enqueue(payload: T): string {
      const id = generateId();
      const operation: QueuedOperation<T> = {
        id,
        payload,
        createdAt: Date.now(),
        retryCount: 0,
      };
      writeOp(operation);
      const ids = readIds();
      ids.push(id);
      writeIds(ids);
      return id;
    },

    async flush(): Promise<number> {
      const ids = readIds();
      let flushed = 0;
      const remainingIds: string[] = [];

      for (const id of ids) {
        const operation = readOp(id);
        if (!operation) {
          // Orphaned ID — skip
          continue;
        }

        if (operation.retryCount >= maxRetries) {
          // Dead-letter — remove from queue
          deleteOp(id);
          continue;
        }

        try {
          await processor(operation);
          deleteOp(id);
          flushed++;
        } catch {
          // Increment retry count and keep in queue
          operation.retryCount++;
          writeOp(operation);
          remainingIds.push(id);
          // Stop on first failure to preserve ordering
          // Append remaining un-attempted IDs
          const currentIndex = ids.indexOf(id);
          remainingIds.push(...ids.slice(currentIndex + 1));
          break;
        }
      }

      writeIds(remainingIds);
      return flushed;
    },

    pendingCount(): number {
      return readIds().length;
    },

    pending(): QueuedOperation<T>[] {
      const ids = readIds();
      const results: QueuedOperation<T>[] = [];
      for (const id of ids) {
        const op = readOp(id);
        if (op) results.push(op);
      }
      return results;
    },

    remove(operationId: string): void {
      deleteOp(operationId);
      const ids = readIds().filter((id) => id !== operationId);
      writeIds(ids);
    },

    clear(): void {
      const ids = readIds();
      for (const id of ids) deleteOp(id);
      writeIds([]);
    },
  };

  return queue;
}
