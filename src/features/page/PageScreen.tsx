import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import { ActivityIndicator, Button, Icon, Snackbar, Text } from 'react-native-paper';

import { apiFetch } from '../../api/client';
import { BottomSheetModal } from '../../components/BottomSheetModal';
import { TOAST_DURATION_SHORT } from '../../constants/toast';
import { t, useMessages } from '../../i18n/messages';
import { dismissOrHome, openChat, useDismissOnHardwareBack } from '../../lib/navigation';
import { queryKeys } from '../../query/keys';
import { noteToIndexEntry, upsertNoteInListCaches } from '../../query/note-list-cache';
import { invalidateNoteLists } from '../../query/workspace-sync';
import {
  fetchNote,
  fetchNotes,
  recordNoteOpen,
  requestNoteAiEdit,
  uploadNoteMedia,
  type ApiError,
  type Note,
  type NoteAttachment,
} from '../../query/notes';
import { createSession } from '../../query/sessions';
import { useTheme } from '../../theme';

import { NoteDetailHeader } from '../notes/NoteDetailHeader';
import { NoteViewActionBar } from '../notes/NoteViewActionBar';
import { discardLocalNoteState, flushPendingNoteOperations, readLocalNote, saveLocalMarkdownNoteEdit } from '../notes/notes-local';
import { applyMarkdownPatchResult } from '../notes/markdown/markdown-patch';
import {
  buildNoteChatContextText,
  collectNoteAttachmentsForChat,
  extractVoiceTranscripts,
} from '../notes/note-to-chat-payload';
import { writeNoteChatPrefill } from '../chat/note-chat-prefill-storage';
import { NoteEditorBridge } from '../notes/editor/NoteEditorBridge';
import type {
  EditorAiRequest,
  EditorAiResponse,
  EditorAiMetadata,
  EditorImagePickResult,
  EditorSelectionContext,
  EditorWikiLinkCandidate,
  NoteEditorLabels,
} from '../notes/editor/editor-protocol';

const SAVE_DEBOUNCE_MS = 600;

type SaveState = 'saved' | 'dirty' | 'saving' | 'pending' | 'failed';

function noteAttachmentRef(noteId: string, attachmentId: string): string {
  return `xopc-attachment://notes/${encodeURIComponent(noteId)}/${encodeURIComponent(attachmentId)}`;
}

function attachmentApiPath(noteId: string, attachmentId: string): string {
  return `/api/notes/${encodeURIComponent(noteId)}/media/${encodeURIComponent(attachmentId)}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return globalThis.btoa(binary);
}

function deriveTitle(note: Note | undefined, fallback: string): string {
  const explicit = note?.title?.trim();
  if (explicit) return explicit;
  const plain = note?.markdown?.replace(/[#*_`>\-[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
  return plain ? Array.from(plain).slice(0, 18).join('') : fallback;
}

function tagsEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  return left.every((tag, index) => tag === right[index]);
}

function firstRouteParam(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] : undefined;
}

function isImageAttachment(attachment: NoteAttachment): boolean {
  return attachment.type === 'image' || attachment.mimeType.startsWith('image/');
}

export function PageScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string | string[] }>();
  const id = firstRouteParam(idParam);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const m = useMessages();
  const pm = m.notesPage;

  const [markdown, setMarkdown] = useState('');
  const [editorMarkdown, setEditorMarkdown] = useState('');
  const [attachmentSrcMap, setAttachmentSrcMap] = useState<Record<string, string>>({});
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[] | undefined>(undefined);
  const [noteStatus, setNoteStatus] = useState<Note['status']>('processed');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [snackMsg, setSnackMsg] = useState('');
  const [moreVisible, setMoreVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState<'catalyst' | 'openChat' | null>(null);
  const [, setSelection] = useState<EditorSelectionContext | null>(null);

  const markdownRef = useRef(markdown);
  const titleRef = useRef(title);
  const tagsRef = useRef(tags);
  const statusRef = useRef(noteStatus);
  const serverMarkdownRef = useRef('');
  const serverTitleRef = useRef<string | undefined>(undefined);
  const serverTagsRef = useRef<string[] | undefined>(undefined);
  const serverStatusRef = useRef<Note['status'] | undefined>(undefined);
  const dirtyRef = useRef(false);
  const seededNoteIdRef = useRef<string | null>(null);
  const openedNoteIdRef = useRef<string | null>(null);
  const handledMissingNoteIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayAttachmentSrcMapRef = useRef(new Map<string, string>());

  markdownRef.current = markdown;
  titleRef.current = title;
  tagsRef.current = tags;
  statusRef.current = noteStatus;

  const resolveAttachmentRefsForDisplay = useCallback(async (
    currentNoteId: string,
    nextMarkdown: string,
    nextAttachments: NoteAttachment[] | undefined,
  ): Promise<Record<string, string>> => {
    displayAttachmentSrcMapRef.current.clear();
    const refPattern = /xopc-attachment:\/\/notes\/([^/\s)]+)\/([^\s)]+)/g;
    const refs = new Map<string, { noteId: string; attachmentId: string }>();
    for (const match of nextMarkdown.matchAll(refPattern)) {
      const canonical = match[0];
      refs.set(canonical, {
        noteId: decodeURIComponent(match[1]),
        attachmentId: decodeURIComponent(match[2]),
      });
    }
    for (const attachment of nextAttachments ?? []) {
      if (!isImageAttachment(attachment)) continue;
      refs.set(noteAttachmentRef(currentNoteId, attachment.id), {
        noteId: currentNoteId,
        attachmentId: attachment.id,
      });
    }
    if (refs.size === 0) return {};

    const nextMap: Record<string, string> = {};
    for (const [canonical, ref] of refs) {
      if (!ref.noteId || !ref.attachmentId) continue;
      try {
        const res = await apiFetch(attachmentApiPath(ref.noteId, ref.attachmentId));
        if (!res.ok) continue;
        const contentType = res.headers.get('Content-Type') || 'application/octet-stream';
        const dataUri = `data:${contentType};base64,${arrayBufferToBase64(await res.arrayBuffer())}`;
        displayAttachmentSrcMapRef.current.set(dataUri, canonical);
        nextMap[canonical] = dataUri;
      } catch {
        continue;
      }
    }
    return nextMap;
  }, []);

  const canonicalizeEditorMarkdown = useCallback((nextMarkdown: string): string => {
    let canonical = nextMarkdown;
    for (const [displaySrc, canonicalSrc] of displayAttachmentSrcMapRef.current.entries()) {
      canonical = canonical.split(displaySrc).join(canonicalSrc);
    }
    return canonical;
  }, []);

  const noteQuery = useQuery({
    queryKey: id ? queryKeys.note(id) : ['note', 'missing'],
    queryFn: () => fetchNote(id!),
    enabled: Boolean(id),
    retry: 1,
  });
  const note = noteQuery.data;

  useEffect(() => {
    if (!id || !noteQuery.isError || handledMissingNoteIdRef.current === id) return;
    const error = noteQuery.error as Partial<ApiError>;
    if (error.status !== 404) return;
    handledMissingNoteIdRef.current = id;
    discardLocalNoteState(id);
    queryClient.removeQueries({ queryKey: queryKeys.note(id) });
    void invalidateNoteLists(queryClient);
    setSnackMsg(pm.missing);
    router.replace('/notes');
  }, [id, noteQuery.error, noteQuery.isError, pm.missing, queryClient, router]);

  useEffect(() => {
    if (!note) return;
    const localNote = readLocalNote(note.id);
    const shouldUseLocal = localNote?.syncState === 'pending'
      || localNote?.syncState === 'failed'
      || (localNote?.localVersion ?? 0) > (note.localVersion ?? 0);
    const displayNote = shouldUseLocal && localNote ? localNote : note;
    const nextMarkdown = displayNote.markdown ?? displayNote.text ?? '';
    const nextTitle = displayNote.title;
    const nextTags = displayNote.tags;
    const nextStatus = displayNote.status;

    serverMarkdownRef.current = nextMarkdown;
    serverTitleRef.current = nextTitle;
    serverTagsRef.current = nextTags;
    serverStatusRef.current = nextStatus;

    const isNewNote = seededNoteIdRef.current !== note.id;
    if (isNewNote || !dirtyRef.current) {
      seededNoteIdRef.current = note.id;
      dirtyRef.current = false;
      setMarkdown(nextMarkdown);
      setEditorMarkdown(nextMarkdown);
      setAttachmentSrcMap({});
      void resolveAttachmentRefsForDisplay(note.id, nextMarkdown, displayNote.attachments).then((nextMap) => {
        if (seededNoteIdRef.current === note.id && !dirtyRef.current) {
          setAttachmentSrcMap(nextMap);
        }
      });
      setTitle(nextTitle ?? deriveTitle(note, pm.untitledNote));
      setTags(nextTags);
      setNoteStatus(nextStatus);
      setSaveState(shouldUseLocal && localNote?.syncState === 'failed' ? 'failed' : shouldUseLocal && localNote?.syncState === 'pending' ? 'pending' : 'saved');
    }

    upsertNoteInListCaches(queryClient, noteToIndexEntry(note));
  }, [note?.id, note?.localVersion, note?.markdown, note?.status, note?.tags, note?.text, note?.title, pm.untitledNote, queryClient, resolveAttachmentRefsForDisplay]);

  useEffect(() => {
    if (!id || openedNoteIdRef.current === id) return;
    openedNoteIdRef.current = id;
    void recordNoteOpen(id).catch(() => undefined);
  }, [id]);

  const flushSave = useCallback(async () => {
    if (!id || !note) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const nextMarkdown = markdownRef.current;
    const nextTitle = titleRef.current.trim() || undefined;
    const nextTags = tagsRef.current;
    const nextStatus = statusRef.current;

    if (
      nextMarkdown === serverMarkdownRef.current
      && nextTitle === serverTitleRef.current
      && tagsEqual(nextTags, serverTagsRef.current)
      && nextStatus === serverStatusRef.current
    ) {
      dirtyRef.current = false;
      const localSnapshot = readLocalNote(id);
      if (localSnapshot?.syncState === 'failed') {
        setSaveState('failed');
        return;
      }
      if (localSnapshot?.syncState === 'pending') {
        setSaveState('pending');
        void flushPendingNoteOperations()
          .then((flushed) => {
            if (flushed > 0) setSaveState('saved');
          })
          .catch(() => {
            setSaveState('failed');
            setSnackMsg(pm.savedOffline);
          });
        return;
      }
      setSaveState('saved');
      return;
    }

    setSaveState('saving');
    const snapshot = saveLocalMarkdownNoteEdit(note, {
      markdown: nextMarkdown,
      title: nextTitle,
      tags: nextTags,
      status: nextStatus,
    });
    serverMarkdownRef.current = nextMarkdown;
    serverTitleRef.current = snapshot.title;
    serverTagsRef.current = snapshot.tags;
    serverStatusRef.current = snapshot.status;
    dirtyRef.current = false;
    setSaveState('pending');
    queryClient.setQueryData(queryKeys.note(id), snapshot);
    upsertNoteInListCaches(queryClient, noteToIndexEntry(snapshot));
    void invalidateNoteLists(queryClient);
    void flushPendingNoteOperations()
      .then((flushed) => {
        if (flushed > 0) setSaveState('saved');
      })
      .catch(() => {
        setSaveState('failed');
        setSnackMsg(pm.savedOffline);
      });
  }, [id, note, pm.savedOffline, queryClient]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void flushSave();
    }, SAVE_DEBOUNCE_MS);
  }, [flushSave]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  useFocusEffect(
    useCallback(() => () => {
      void flushSave();
    }, [flushSave]),
  );

  const updateMarkdown = useCallback((next: string) => {
    const canonical = canonicalizeEditorMarkdown(next);
    dirtyRef.current = true;
    setSaveState('dirty');
    setEditorMarkdown(next);
    setMarkdown(canonical);
    scheduleSave();
  }, [canonicalizeEditorMarkdown, scheduleSave]);

  const updateTitle = useCallback((next: string) => {
    dirtyRef.current = true;
    setSaveState('dirty');
    setTitle(next);
    scheduleSave();
  }, [scheduleSave]);

  const handleBack = useCallback(() => {
    Keyboard.dismiss();
    void flushSave();
    dismissOrHome(router);
  }, [flushSave, router]);

  useDismissOnHardwareBack(router, { onBack: handleBack });

  const handleDone = useCallback(() => {
    Keyboard.dismiss();
    void flushSave();
  }, [flushSave]);

  const buildChatPrefill = useCallback((instruction: string): string => {
    const context = buildNoteChatContextText(
      markdownRef.current,
      {
        imagePlaceholder: (alt) => t(pm.noteChatImagePlaceholder, { alt }),
        voiceTranscript: (text) => t(pm.noteChatVoiceTranscript, { text }),
      },
      { voiceTranscripts: extractVoiceTranscripts(note?.attachments) },
    );
    const noteTitle = titleRef.current.trim();
    return [
      instruction.trim(),
      noteTitle ? `${pm.catalystChatNoteTitle}: ${noteTitle}` : '',
      context,
    ].filter(Boolean).join('\n\n');
  }, [note?.attachments, pm.catalystChatNoteTitle, pm.noteChatImagePlaceholder, pm.noteChatVoiceTranscript]);

  const handleOpenNoteChat = useCallback(async (kind: 'catalyst' | 'openChat') => {
    if (!id || !note) return;
    setActionLoading(kind);
    try {
      Keyboard.dismiss();
      await flushSave();
      const instruction = kind === 'catalyst' ? pm.catalystChatPrompt : pm.editorSendToChatPrefix;
      const prefill = buildChatPrefill(instruction);
      const media = await collectNoteAttachmentsForChat(id, markdownRef.current, [], note.attachments);
      const key = await createSession(undefined, { forceNew: true });
      writeNoteChatPrefill(key, {
        text: prefill,
        attachments: media.attachments,
        droppedCount: media.droppedCount,
      });
      openChat(router, key, { msg: prefill });
    } catch (error) {
      setSnackMsg(error instanceof Error ? error.message : pm.actionFailed);
    } finally {
      setActionLoading(null);
    }
  }, [buildChatPrefill, flushSave, id, note, pm.actionFailed, pm.catalystChatPrompt, pm.editorSendToChatPrefix, router]);

  const handleShare = useCallback(async () => {
    setMoreVisible(false);
    try {
      await flushSave();
      const message = markdownRef.current.trim() || titleRef.current.trim() || pm.untitledNote;
      if (Platform.OS === 'web') {
        await Clipboard.setStringAsync(message);
        setSnackMsg(pm.shareNotesCopied);
        return;
      }
      await Share.share({
        message,
        title: titleRef.current.trim() || pm.shareNotesTitle,
      });
    } catch {
      await Clipboard.setStringAsync(markdownRef.current.trim() || titleRef.current.trim() || pm.untitledNote);
      setSnackMsg(pm.shareNotesCopied);
    }
  }, [flushSave, pm.shareNotesCopied, pm.shareNotesTitle, pm.untitledNote]);

  const handleSyncNow = useCallback(async () => {
    setMoreVisible(false);
    try {
      await flushSave();
      const flushed = await flushPendingNoteOperations();
      if (id) await queryClient.invalidateQueries({ queryKey: queryKeys.note(id) });
      await invalidateNoteLists(queryClient);
      setSnackMsg(flushed > 0 ? pm.updated : pm.saved);
    } catch (error) {
      setSnackMsg(error instanceof Error ? error.message : pm.actionFailed);
    }
  }, [flushSave, id, pm.actionFailed, pm.saved, pm.updated, queryClient]);

  const handleRequestImage = useCallback(async (): Promise<EditorImagePickResult> => {
    if (!id) return null;
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, base64: true });
    if (picked.canceled || !picked.assets[0]?.uri) return null;
    try {
      await flushSave();
      const asset = picked.assets[0];
      const name = asset.fileName ?? `image-${Date.now()}.jpg`;
      const mimeType = asset.mimeType ?? 'image/jpeg';
      const attachment = await uploadNoteMedia(id, {
        file: asset.file,
        localUri: asset.uri,
        name,
        mimeType,
        content: asset.base64 ?? undefined,
      });
      queryClient.setQueryData<Note>(queryKeys.note(id), (current) => {
        if (!current) return current;
        const attachments = current.attachments?.some((item) => item.id === attachment.id)
          ? current.attachments
          : [...(current.attachments ?? []), attachment];
        return { ...current, attachments };
      });
      const canonical = noteAttachmentRef(id, attachment.id);
      const res = await apiFetch(attachmentApiPath(id, attachment.id));
      const contentType = res.headers.get('Content-Type') || mimeType;
      const dataUri = res.ok
        ? `data:${contentType};base64,${arrayBufferToBase64(await res.arrayBuffer())}`
        : canonical;
      displayAttachmentSrcMapRef.current.set(dataUri, canonical);
      setAttachmentSrcMap((current) => ({ ...current, [canonical]: dataUri }));
      setSnackMsg(pm.editorAttachmentAdded);
      return {
        src: canonical,
        displaySrc: dataUri,
        alt: name,
      };
    } catch (error) {
      setSnackMsg(error instanceof Error ? error.message : pm.actionFailed);
      return null;
    }
  }, [flushSave, id, pm.actionFailed, pm.editorAttachmentAdded, queryClient]);

  const handleRequestAi = useCallback(async (request: EditorAiRequest): Promise<EditorAiResponse | null> => {
    if (!id) return null;
    try {
      await flushSave();
      const contextMarkdown = request.selection.markdown || request.selection.currentBlockMarkdown || request.markdown;
      const result = await requestNoteAiEdit(id, {
        instruction: request.instruction,
        markdown: request.markdown,
        context: {
          type: request.selection.from === request.selection.to ? 'block' : 'selection',
          range: { start: request.selection.from, end: request.selection.to },
          markdown: contextMarkdown,
          blockType: 'prosemirror',
        },
      });
      const patched = applyMarkdownPatchResult(request.markdown, result.patch.operations);
      return {
        id: result.patch.id,
        summary: result.patch.summary || result.message,
        markdown: patched.markdown,
        title: patched.metadata.title,
        tags: patched.metadata.tags,
        status: patched.metadata.status,
      };
    } catch (error) {
      setSnackMsg(error instanceof Error ? error.message : pm.aiEditFailed);
      return null;
    }
  }, [flushSave, id, pm.aiEditFailed]);

  const handleApplyAiMetadata = useCallback(async (metadata: EditorAiMetadata): Promise<void> => {
    let touched = false;
    if (metadata.title !== undefined) {
      setTitle(metadata.title ?? '');
      touched = true;
    }
    if (metadata.tags !== undefined) {
      setTags(metadata.tags);
      touched = true;
    }
    if (metadata.status !== undefined) {
      setNoteStatus(metadata.status);
      touched = true;
    }
    if (touched) {
      dirtyRef.current = true;
      setSaveState('dirty');
      scheduleSave();
    }
  }, [scheduleSave]);

  const handleRequestWikiLink = useCallback(async (query: string): Promise<EditorWikiLinkCandidate[]> => {
    try {
      const trimmed = query.trim();
      const result = await fetchNotes({
        search: trimmed || undefined,
        limit: 8,
        sortBy: trimmed ? 'updatedAt' : 'lastOpenedAt',
        sortOrder: 'desc',
      });
      return result.items
        .filter((item) => item.id !== id)
        .map((item) => ({
          id: item.id,
          title: item.title?.trim() || item.snippet?.trim() || pm.untitledNote,
          subtitle: item.snippet,
        }));
    } catch (error) {
      setSnackMsg(error instanceof Error ? error.message : pm.actionFailed);
      return [];
    }
  }, [id, pm.actionFailed, pm.untitledNote]);

  const labels = useMemo<NoteEditorLabels>(() => ({
    placeholder: pm.editorPlaceholderText,
    aiPlaceholder: pm.aiInputPlaceholder,
    aiRewrite: pm.aiPromptRewrite,
    aiShorten: pm.aiPromptShorten,
    aiContinue: pm.editorContinueBelow,
    aiTodo: pm.aiPromptExtractTodos,
    aiApply: pm.aiApply,
    aiDiscard: pm.aiDiscard,
    aiThinking: pm.aiGeneratePreview,
    image: pm.editorInsertImage,
    wikiLink: pm.editorInsertWikiLink,
    wikiLinkPlaceholder: pm.wikiLinkSearchPlaceholder,
    wikiLinkInsertTyped: pm.wikiLinkInsertTyped,
    wikiLinkNoResults: pm.wikiLinkNoResults,
    bold: pm.editorFormatBold,
    italic: pm.editorFormatItalic,
    todo: pm.editorBlockTodo,
    bullet: pm.editorBlockBulletList,
    ordered: pm.editorBlockNumberedList,
    quote: pm.editorBlockQuote,
    code: pm.editorBlockCode,
  }), [pm]);

  const saveLabel = saveState === 'saving'
    ? pm.saving
    : saveState === 'failed'
      ? pm.saveFailed
      : saveState === 'pending'
        ? pm.savedOffline
        : saveState === 'dirty'
          ? pm.savePending
          : pm.saved;
  const shouldShowSaveState = saveState !== 'saved';
  const shouldShowMetaRow = shouldShowSaveState;
  const showLoading = noteQuery.isLoading && !note;
  const showError = noteQuery.isError && !note;

  const rightActions = useMemo(() => [
    { icon: 'check', label: pm.done, onPress: handleDone },
  ], [handleDone, pm.done]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.surface.base }]}>
      <NoteDetailHeader
        onBack={handleBack}
        backLabel={m.common.back}
        rightActions={note ? rightActions : undefined}
      />

      {showLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent.primary} />
          <Text style={{ color: colors.text.tertiary }}>{m.common.loading}</Text>
        </View>
      ) : showError ? (
        <View style={styles.center}>
          <Icon source="cloud-alert-outline" size={42} color={colors.text.tertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>
            {noteQuery.error instanceof Error ? noteQuery.error.message : pm.actionFailed}
          </Text>
          <Button mode="contained-tonal" onPress={() => void noteQuery.refetch()}>{m.common.retry}</Button>
        </View>
      ) : note && id ? (
        <View style={styles.editorWrap}>
          <View style={[styles.titleWrap, !shouldShowMetaRow && styles.titleWrapCompact, { borderBottomColor: colors.border.subtle }]}>
            <TextInput
              value={title}
              onChangeText={updateTitle}
              placeholder={pm.untitledNote}
              placeholderTextColor={colors.text.tertiary}
              accessibilityLabel={pm.aiMetadataNoteTitle}
              style={[styles.titleInput, { color: colors.text.primary }]}
            />
            {shouldShowMetaRow ? (
              <View style={styles.metaRow}>
                {shouldShowSaveState ? (
                  <Text
                    style={[
                      styles.modeLabel,
                      {
                        color: saveState === 'failed'
                          ? colors.semantic.error
                          : colors.text.secondary,
                      },
                    ]}
                  >
                    {saveLabel}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
          <NoteEditorBridge
            noteId={id}
            markdown={editorMarkdown}
            attachmentSrcMap={attachmentSrcMap}
            labels={labels}
            onChangeMarkdown={updateMarkdown}
            onSelectionChange={setSelection}
            onRequestImage={handleRequestImage}
            onRequestAi={handleRequestAi}
            onApplyAiMetadata={handleApplyAiMetadata}
            onRequestWikiLink={handleRequestWikiLink}
          />
        </View>
      ) : null}

      {saveState === 'failed' ? (
        <Pressable
          style={[
            styles.retryBar,
            note && id ? styles.retryBarAboveActions : null,
            { backgroundColor: colors.surface.panel, borderColor: colors.border.default },
          ]}
          onPress={() => void flushSave()}
          accessibilityRole="button"
          accessibilityLabel={pm.saveFailed}
        >
          <Icon source="cloud-alert-outline" size={18} color={colors.semantic.error} />
          <Text style={[styles.retryText, { color: colors.text.primary }]}>{pm.saveFailed}</Text>
        </Pressable>
      ) : null}

      {note && id ? (
        <NoteViewActionBar
          labels={{
            catalyst: pm.catalystTitle,
            openChat: pm.catalystOpenChat,
            more: pm.viewMore,
          }}
          loading={{
            catalyst: actionLoading === 'catalyst',
            openChat: actionLoading === 'openChat',
          }}
          onCatalyst={() => void handleOpenNoteChat('catalyst')}
          onOpenChat={() => void handleOpenNoteChat('openChat')}
          onMore={() => setMoreVisible(true)}
        />
      ) : null}

      <BottomSheetModal
        visible={moreVisible}
        onDismiss={() => setMoreVisible(false)}
        title={pm.viewMore}
        maxHeight="40%"
      >
        <View style={styles.moreActions}>
          <Pressable
            style={({ pressed }) => [styles.moreAction, pressed && styles.moreActionPressed]}
            onPress={() => void handleSyncNow()}
            accessibilityRole="button"
            accessibilityLabel={pm.syncNow}
          >
            <Icon source="cloud-sync-outline" size={22} color={colors.text.secondary} />
            <Text style={[styles.moreActionLabel, { color: colors.text.primary }]}>{pm.syncNow}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.moreAction, pressed && styles.moreActionPressed]}
            onPress={() => void handleShare()}
            accessibilityRole="button"
            accessibilityLabel={pm.viewShare}
          >
            <Icon source="share-variant-outline" size={22} color={colors.text.secondary} />
            <Text style={[styles.moreActionLabel, { color: colors.text.primary }]}>{pm.viewShare}</Text>
          </Pressable>
        </View>
      </BottomSheetModal>

      <Snackbar
        visible={Boolean(snackMsg)}
        duration={TOAST_DURATION_SHORT}
        onDismiss={() => setSnackMsg('')}
      >
        {snackMsg}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  editorWrap: {
    flex: 1,
    minHeight: 0,
  },
  titleWrap: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleWrapCompact: {
    paddingBottom: 4,
  },
  titleInput: {
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '700',
    paddingVertical: 4,
  },
  metaRow: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modeLabel: {
    fontSize: 12,
    flexShrink: 1,
  },
  statusDot: {
    fontSize: 12,
  },
  retryBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  retryBarAboveActions: {
    bottom: 104,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '600',
  },
  moreActions: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 8,
  },
  moreAction: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  moreActionPressed: {
    opacity: 0.72,
  },
  moreActionLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
});
