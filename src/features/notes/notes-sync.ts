/**
 * Notes quick-capture offline sync — backed by the unified OfflineQueue.
 *
 * When a quick capture fails (offline), the text is queued and flushed
 * when connectivity resumes. Replaces the previous hand-rolled pending
 * note storage with a generic, tested queue primitive.
 */
import { createOfflineQueue, type OfflineQueue, type QueuedOperation } from '../../sync';
import { quickCaptureNote } from '../../query/notes';

export interface CapturePayload {
  text: string;
}

const captureQueue: OfflineQueue<CapturePayload> = createOfflineQueue<CapturePayload>({
  namespace: 'notes:capture',
  processor: async (operation: QueuedOperation<CapturePayload>) => {
    await quickCaptureNote(operation.payload.text);
  },
});

/** Queue a note for later sync. Returns the operation ID. */
export function queueNote(text: string): string {
  return captureQueue.enqueue({ text });
}

/** Flush all pending quick-capture notes. Returns count flushed. */
export async function flushPendingNotes(): Promise<number> {
  return captureQueue.flush();
}

/** Number of pending quick-capture notes waiting to sync. */
export function getPendingNoteCount(): number {
  return captureQueue.pendingCount();
}

/** All pending quick-capture payloads (for UI display). */
export function getPendingNotes(): Array<{ id: string; text: string; createdAt: number }> {
  return captureQueue.pending().map((op) => ({
    id: op.id,
    text: op.payload.text,
    createdAt: op.createdAt,
  }));
}

// Legacy alias — kept for one release to avoid breaking imports
export const queueOfflineNote = queueNote;
