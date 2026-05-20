import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';

import { agentSteer } from './follow-up-agent-api';
import {
  clearFollowUpQueueSnapshot,
  readFollowUpQueueSnapshot,
  writeFollowUpQueueSnapshot,
} from './follow-up-queue-storage';
import {
  buildFollowUpContextPack,
  followUpPromptForSuggestionId,
  suggestFollowUps,
  type FollowUpSuggestionId,
} from './follow-up-suggestions';
import type { FollowUpPromptLocale } from './follow-up-prompts';
import type { WireAttachment } from './composer.types';
import type { Message } from './messages.types';
import {
  FOLLOW_UP_AUTO_SEND_IDLE_MS,
  MAX_PENDING_FOLLOW_UPS,
  type PendingFollowUp,
} from './pending-follow-up.types';
import { newFollowUpRowId } from './follow-up-utils';
import { usePreferencesStore } from '../../stores/preferences-store';

export type ChatFollowUpApi = {
  pendingFollowUps: PendingFollowUp[];
  followUpSuggestions: FollowUpSuggestionId[];
  steeringFollowUpId: string | null;
  editingFollowUpId: string | null;
  addPendingFollowUp: (content: string, attachments?: PendingFollowUp['attachments']) => void;
  beginEditFollowUp: (id: string) => void;
  cancelEditFollowUp: () => void;
  commitEditFollowUp: (
    id: string,
    content: string,
    attachments?: PendingFollowUp['attachments'],
  ) => void;
  removePendingFollowUp: (id: string) => void;
  movePendingFollowUp: (id: string, dir: 'up' | 'down') => void;
  reorderPendingFollowUp: (fromIndex: number, toIndex: number) => void;
  steerPendingFollowUp: (id: string) => Promise<void>;
  pickFollowUpSuggestion: (id: FollowUpSuggestionId) => void;
  clearPendingFollowUps: () => void;
  refreshFollowUpSuggestions: (input: {
    appended: Message;
    messages: Message[];
    clarifyActive?: boolean;
  }) => void;
  clearFollowUpSuggestions: () => void;
  flushSteeringQueue: (forSessionKey?: string | null) => Promise<void>;
};

export function useChatFollowUp(options: {
  sessionKey: string | null;
  sessionKeyRef: MutableRefObject<string | null>;
  /** True while a turn is in flight (pick chip → queue instead of send). */
  runBusyRef: MutableRefObject<boolean>;
  /** True only while SSE send/stream is active (flush guard). */
  streamActiveRef: MutableRefObject<boolean>;
  clarifyActiveRef: MutableRefObject<boolean>;
  sendRef: MutableRefObject<
    (content: string, attachments?: WireAttachment[]) => Promise<boolean>
  >;
  onQueueFull?: () => void;
}): ChatFollowUpApi {
  const {
    sessionKey,
    sessionKeyRef,
    runBusyRef,
    streamActiveRef,
    clarifyActiveRef,
    sendRef,
    onQueueFull,
  } = options;

  const [pendingFollowUps, setPendingFollowUps] = useState<PendingFollowUp[]>([]);
  const pendingFollowUpsRef = useRef<PendingFollowUp[]>([]);
  const [steeringFollowUpId, setSteeringFollowUpId] = useState<string | null>(null);
  const [editingFollowUpId, setEditingFollowUpId] = useState<string | null>(null);
  const editingFollowUpIdRef = useRef<string | null>(null);
  const [followUpSuggestions, setFollowUpSuggestions] = useState<FollowUpSuggestionId[]>([]);
  const followUpSuggestionsRef = useRef<FollowUpSuggestionId[]>([]);
  const followUpPrevSessionRef = useRef<string | null>(null);

  useEffect(() => {
    const prevLoaded = followUpPrevSessionRef.current;
    if (prevLoaded != null && prevLoaded !== sessionKey) {
      writeFollowUpQueueSnapshot(prevLoaded, {
        pending: structuredClone(pendingFollowUpsRef.current),
        suggestions: [...followUpSuggestionsRef.current],
        editingId: editingFollowUpIdRef.current,
      });
    }
    followUpPrevSessionRef.current = sessionKey;

    if (!sessionKey) {
      pendingFollowUpsRef.current = [];
      setPendingFollowUps([]);
      followUpSuggestionsRef.current = [];
      setFollowUpSuggestions([]);
      setEditingFollowUpId(null);
      return;
    }

    const snap = readFollowUpQueueSnapshot(sessionKey);
    if (snap) {
      const pending = structuredClone(snap.pending);
      const suggestions = [...snap.suggestions];
      pendingFollowUpsRef.current = pending;
      setPendingFollowUps(pending);
      followUpSuggestionsRef.current = suggestions;
      setFollowUpSuggestions(suggestions);
      setEditingFollowUpId(snap.editingId);
    } else {
      pendingFollowUpsRef.current = [];
      setPendingFollowUps([]);
      followUpSuggestionsRef.current = [];
      setFollowUpSuggestions([]);
      setEditingFollowUpId(null);
    }
  }, [sessionKey]);

  useEffect(() => {
    if (!sessionKey) return;
    const t = setTimeout(() => {
      if (sessionKeyRef.current !== sessionKey) return;
      writeFollowUpQueueSnapshot(sessionKey, {
        pending: structuredClone(pendingFollowUpsRef.current),
        suggestions: [...followUpSuggestionsRef.current],
        editingId: editingFollowUpIdRef.current,
      });
    }, 280);
    return () => clearTimeout(t);
  }, [sessionKey, pendingFollowUps, followUpSuggestions, editingFollowUpId, sessionKeyRef]);

  const clearPendingFollowUps = useCallback(() => {
    const key = sessionKeyRef.current;
    if (key) clearFollowUpQueueSnapshot(key);
    pendingFollowUpsRef.current = [];
    setPendingFollowUps([]);
    setEditingFollowUpId(null);
  }, [sessionKeyRef]);

  const clearFollowUpSuggestions = useCallback(() => {
    followUpSuggestionsRef.current = [];
    setFollowUpSuggestions([]);
  }, []);

  const refreshFollowUpSuggestions = useCallback(
    (input: { appended: Message; messages: Message[]; clarifyActive?: boolean }) => {
      const locale = usePreferencesStore.getState().language as FollowUpPromptLocale;
      const ctx = buildFollowUpContextPack({
        messages: input.messages,
        appendedAssistant: input.appended,
        locale,
        channel: 'webchat',
        clarifyActive: input.clarifyActive ?? clarifyActiveRef.current,
      });
      const next = ctx ? suggestFollowUps(ctx) : [];
      followUpSuggestionsRef.current = next;
      setFollowUpSuggestions(next);
    },
    [clarifyActiveRef],
  );

  const flushSteeringQueue = useCallback(async (forSessionKey?: string | null) => {
    const sk = sessionKeyRef.current;
    if (forSessionKey != null && forSessionKey !== sk) return;
    if (!sk) return;

    let q = pendingFollowUpsRef.current;
    while (q.length > 0 && !q[0].text.trim() && !q[0].attachments?.length) {
      q = q.slice(1);
    }
    if (q.length === 0) {
      pendingFollowUpsRef.current = [];
      setPendingFollowUps([]);
      return;
    }
    if (q.length !== pendingFollowUpsRef.current.length) {
      pendingFollowUpsRef.current = q;
      setPendingFollowUps(q);
    }

    const [first, ...rest] = q;
    const trimmed = first.text?.trim() ?? '';
    const atts = first.attachments;
    if (!trimmed && !atts?.length) return;

    if (streamActiveRef.current) return;

    if (editingFollowUpIdRef.current === first.id) {
      setEditingFollowUpId(null);
    }
    pendingFollowUpsRef.current = rest;
    setPendingFollowUps(rest);
    await sendRef.current(first.text, atts?.length ? atts : undefined);
  }, [sendRef, sessionKeyRef, streamActiveRef]);

  useEffect(() => {
    if (!sessionKey) return;
    if (clarifyActiveRef.current) return;
    if (pendingFollowUps.length === 0) return;
    if (streamActiveRef.current) return;
    const first = pendingFollowUps[0];
    if (!first || (!first.text.trim() && !first.attachments?.length)) return;

    const tid = setTimeout(() => {
      if (sessionKeyRef.current !== sessionKey) return;
      if (streamActiveRef.current) return;
      if (clarifyActiveRef.current) return;
      void flushSteeringQueue(sessionKey);
    }, FOLLOW_UP_AUTO_SEND_IDLE_MS);
    return () => clearTimeout(tid);
  }, [
    sessionKey,
    pendingFollowUps,
    flushSteeringQueue,
    streamActiveRef,
    clarifyActiveRef,
    sessionKeyRef,
  ]);

  const addPendingFollowUp = useCallback(
    (content: string, attachments?: PendingFollowUp['attachments']) => {
      const trimmed = content.trim();
      if (!trimmed && !attachments?.length) return;
      if (pendingFollowUpsRef.current.length >= MAX_PENDING_FOLLOW_UPS) {
        onQueueFull?.();
        return;
      }
      const row: PendingFollowUp = {
        id: newFollowUpRowId(),
        text: trimmed || content,
        attachments: attachments?.length ? attachments : undefined,
      };
      setPendingFollowUps((prev) => {
        const next = [...prev, row];
        pendingFollowUpsRef.current = next;
        return next;
      });
    },
    [onQueueFull],
  );

  const beginEditFollowUp = useCallback((id: string) => {
    setEditingFollowUpId(id);
  }, []);

  const cancelEditFollowUp = useCallback(() => {
    setEditingFollowUpId(null);
  }, []);

  const commitEditFollowUp = useCallback(
    (
      id: string,
      content: string,
      attachments?: PendingFollowUp['attachments'],
    ) => {
      const trimmed = content.trim();
      const prev = pendingFollowUpsRef.current;
      const i = prev.findIndex((r) => r.id === id);
      if (i < 0) {
        setEditingFollowUpId(null);
        return;
      }
      if (!trimmed && !attachments?.length) {
        const next = prev.filter((r) => r.id !== id);
        pendingFollowUpsRef.current = next;
        setPendingFollowUps(next);
        setEditingFollowUpId(null);
        return;
      }
      const next = [...prev];
      next[i] = {
        ...next[i],
        text: trimmed || content,
        attachments: attachments?.length ? attachments : undefined,
      };
      pendingFollowUpsRef.current = next;
      setPendingFollowUps(next);
      setEditingFollowUpId(null);
    },
    [],
  );

  const removePendingFollowUp = useCallback((id: string) => {
    if (editingFollowUpIdRef.current === id) {
      setEditingFollowUpId(null);
    }
    setPendingFollowUps((prev) => {
      const next = prev.filter((r) => r.id !== id);
      pendingFollowUpsRef.current = next;
      return next;
    });
  }, []);

  const movePendingFollowUp = useCallback((id: string, dir: 'up' | 'down') => {
    setPendingFollowUps((prev) => {
      const i = prev.findIndex((r) => r.id === id);
      if (i < 0) return prev;
      const j = dir === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      pendingFollowUpsRef.current = next;
      return next;
    });
  }, []);

  const reorderPendingFollowUp = useCallback((fromIndex: number, toIndex: number) => {
    setPendingFollowUps((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [removed] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, removed);
      pendingFollowUpsRef.current = next;
      return next;
    });
  }, []);

  const steerPendingFollowUp = useCallback(async (id: string) => {
    const key = sessionKeyRef.current;
    if (!key) return;
    const row = pendingFollowUpsRef.current.find((r) => r.id === id);
    if (!row?.text.trim() || row.attachments?.length) return;
    setSteeringFollowUpId(id);
    try {
      const ok = await agentSteer(key, row.text.trim());
      if (ok) {
        setPendingFollowUps((prev) => {
          const next = prev.filter((r) => r.id !== id);
          pendingFollowUpsRef.current = next;
          return next;
        });
        if (editingFollowUpIdRef.current === id) {
          setEditingFollowUpId(null);
        }
      }
    } finally {
      setSteeringFollowUpId(null);
    }
  }, [sessionKeyRef]);

  const pickFollowUpSuggestion = useCallback(
    (id: FollowUpSuggestionId) => {
      const locale = usePreferencesStore.getState().language as FollowUpPromptLocale;
      const t = followUpPromptForSuggestionId(id, locale).trim();
      if (!t) return;
      followUpSuggestionsRef.current = [];
      setFollowUpSuggestions([]);
      if (runBusyRef.current) {
        if (pendingFollowUpsRef.current.length >= MAX_PENDING_FOLLOW_UPS) {
          onQueueFull?.();
          return;
        }
        addPendingFollowUp(t, undefined);
        return;
      }
      void sendRef.current(t, undefined);
    },
    [addPendingFollowUp, onQueueFull, runBusyRef, sendRef],
  );

  pendingFollowUpsRef.current = pendingFollowUps;
  followUpSuggestionsRef.current = followUpSuggestions;
  editingFollowUpIdRef.current = editingFollowUpId;

  return {
    pendingFollowUps,
    followUpSuggestions,
    steeringFollowUpId,
    editingFollowUpId,
    addPendingFollowUp,
    beginEditFollowUp,
    cancelEditFollowUp,
    commitEditFollowUp,
    removePendingFollowUp,
    movePendingFollowUp,
    reorderPendingFollowUp,
    steerPendingFollowUp,
    pickFollowUpSuggestion,
    clearPendingFollowUps,
    refreshFollowUpSuggestions,
    clearFollowUpSuggestions,
    flushSteeringQueue,
  };
}
