import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { ActivityIndicator, Button, Icon, Snackbar, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TOAST_DURATION_SHORT } from '../../constants/toast';
import { t, useMessages } from '../../i18n/messages';
import { dismissOrHome, openNoteDetail, useDismissOnHardwareBack } from '../../lib/navigation';
import { queryKeys } from '../../query/keys';
import { loadBacklinksForTitle } from '../../query/note-link-index';
import { noteToIndexEntry, upsertNoteInListCaches } from '../../query/note-list-cache';
import { invalidateNoteLists } from '../../query/workspace-sync';
import {
  fetchNote,
  fetchNotes,
  recordNoteOpen,
  requestNoteAiEdit,
  updateNote,
  uploadNoteMedia,
  type Note,
  type NoteAiPatch,
} from '../../query/notes';
import { storage } from '../../storage/mmkv';
import { useGatewayStore } from '../../stores/gateway-store';
import { useTheme } from '../../theme';

import { NoteDetailHeader } from '../notes/NoteDetailHeader';
import { flushPendingNoteOperations, readLocalNote, saveLocalMarkdownNoteEdit } from '../notes/notes-local';
import { MarkdownNoteEditor } from '../notes/markdown/MarkdownNoteEditor';
import { StructuredMarkdownEditor } from '../notes/markdown/StructuredMarkdownEditor';
import { canFocusStructuredMarkdownRange, extractMarkdownWikiLinks, findMarkdownMatches, formatWikiLink, getMarkdownAiContext, getMarkdownOutline, getVisibleMarkdownSelection, getWholeMarkdownAiContext, isMarkdownRangeInFrontmatter, renderObsidianCalloutsToMarkdown, renderWikiLinksToMarkdown, stripMarkdownFrontmatter, summarizeMarkdownAiContext, type MarkdownAiContext } from '../notes/markdown/markdown-document';
import { formatMarkdownImage, insertMarkdownCallout, insertMarkdownCodeBlock, insertMarkdownHeading, insertMarkdownLineTemplate, insertMarkdownLink, insertMarkdownPrefixedLines, wrapMarkdownSelection } from '../notes/markdown/markdown-insert';
import { applyMarkdownPatchResult, getMarkdownPatchChangedRange, getMarkdownPatchPreviewSnippets, type MarkdownPatchChangedRange, type MarkdownPatchPreviewSnippets, type MarkdownPatchResult } from '../notes/markdown/markdown-patch';
import type { BlockInsertAction } from '../notes/blocks/BlockInsertBar';
import { MarkdownView } from '../chat/MarkdownView';

const SAVE_DEBOUNCE_MS = 600;

type SelectionRange = { start: number; end: number };
type StructuredFocusRequest = SelectionRange & { tick: number };
type SourceFocusRequest = SelectionRange & { tick: number };
type NoteEditorMode = 'read' | 'edit' | 'source';
type SaveState = 'saved' | 'dirty' | 'saving' | 'pending' | 'failed';
type PendingAiSuggestion = {
  patch: NoteAiPatch;
  beforeMarkdown: string;
  result: MarkdownPatchResult;
  preview: MarkdownPatchPreviewSnippets;
  changedRange: MarkdownPatchChangedRange | null;
};
type AiContextSnapshot = {
  markdown: string;
  context: MarkdownAiContext;
};
type NoteUndoSnapshot = {
  markdown: string;
  title: string;
  tags?: string[];
  status: Note['status'];
  focusRange: MarkdownPatchChangedRange | null;
};

function noteAttachmentRef(noteId: string, attachmentId: string): string {
  return `xopc-attachment://notes/${encodeURIComponent(noteId)}/${encodeURIComponent(attachmentId)}`;
}

function resolvePreviewImageSrc(src: string): string {
  const match = /^xopc-attachment:\/\/notes\/([^/\s)]+)\/([^\s)]+)$/.exec(src);
  if (!match) return src;
  const noteId = decodeURIComponent(match[1]);
  const attachmentId = decodeURIComponent(match[2]);
  return useGatewayStore.getState().apiUrl(`/api/notes/${encodeURIComponent(noteId)}/media/${encodeURIComponent(attachmentId)}`);
}

function markdownForPreview(markdown: string): string {
  return markdown.replace(/xopc-attachment:\/\/notes\/([^/\s)]+)\/([^\s)]+)/g, (_full, noteIdRaw: string, attachmentIdRaw: string) => {
    return resolvePreviewImageSrc(`xopc-attachment://notes/${noteIdRaw}/${attachmentIdRaw}`);
  });
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

function statusDisplayLabel(status: Note['status'], pm: ReturnType<typeof useMessages>['notesPage']): string | null {
  if (status === 'inbox') return pm.filterInbox;
  if (status === 'archived') return pm.filterArchived;
  if (status === 'trashed') return pm.delete;
  return null;
}

function hasAiMetadata(metadata: MarkdownPatchResult['metadata']): boolean {
  return metadata.title !== undefined
    || metadata.tags !== undefined
    || metadata.status !== undefined
    || metadata.frontmatter !== undefined;
}

function formatFrontmatterPreview(frontmatter: NonNullable<MarkdownPatchResult['metadata']['frontmatter']>): string {
  return Object.entries(frontmatter)
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(', ') : value ?? '-'}`)
    .join(' · ');
}

function parseInternalNoteUrl(url: string): { title: string; heading?: string } | null {
  if (!url.startsWith('xopc-note://open?')) return null;
  const query = url.slice('xopc-note://open?'.length);
  const params = new URLSearchParams(query);
  const title = params.get('title')?.trim();
  if (!title) return null;
  return {
    title,
    heading: params.get('heading')?.trim() || undefined,
  };
}

function normalizeLinkTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeHeadingTarget(heading: string): string {
  return heading.trim().replace(/\s*\{#[^}]+}\s*$/, '').replace(/\s+/g, ' ').toLowerCase();
}

function firstRouteParam(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] : undefined;
}

function routeNumberParam(value: string | string[] | undefined): number | null {
  const raw = firstRouteParam(value);
  if (raw == null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function PageScreen() {
  const { id: idParam, heading: headingParam, start: startParam, end: endParam } = useLocalSearchParams<{
    id: string | string[];
    heading?: string | string[];
    start?: string | string[];
    end?: string | string[];
  }>();
  const id = firstRouteParam(idParam);
  const routeHeading = firstRouteParam(headingParam);
  const routeRangeStart = routeNumberParam(startParam);
  const routeRangeEnd = routeNumberParam(endParam);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const m = useMessages();
  const pm = m.notesPage;

  const [markdown, setMarkdown] = useState('');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[] | undefined>(undefined);
  const [noteStatus, setNoteStatus] = useState<Note['status']>('processed');
  const [snackMsg, setSnackMsg] = useState('');
  const [aiDialogVisible, setAiDialogVisible] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiContextSnapshot, setAiContextSnapshot] = useState<AiContextSnapshot | null>(null);
  const [pendingAiSuggestion, setPendingAiSuggestion] = useState<PendingAiSuggestion | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<NoteUndoSnapshot | null>(null);
  const [outlineVisible, setOutlineVisible] = useState(false);
  const [linksVisible, setLinksVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [wikiLinkVisible, setWikiLinkVisible] = useState(false);
  const [moreVisible, setMoreVisible] = useState(false);
  const [wikiLinkQuery, setWikiLinkQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selection, setSelection] = useState<SelectionRange>({ start: 0, end: 0 });
  const [structuredFocusSelection, setStructuredFocusSelection] = useState<StructuredFocusRequest | undefined>(undefined);
  const [sourceFocusSelection, setSourceFocusSelection] = useState<SourceFocusRequest | undefined>(undefined);
  const [mode, setMode] = useState<NoteEditorMode>('read');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [editFocusTick, setEditFocusTick] = useState(0);

  const markdownRef = useRef(markdown);
  const titleRef = useRef(title);
  const serverMarkdownRef = useRef('');
  const serverTitleRef = useRef<string | undefined>(undefined);
  const serverTagsRef = useRef<string[] | undefined>(undefined);
  const serverStatusRef = useRef<Note['status'] | undefined>(undefined);
  const dirtyRef = useRef(false);
  const seededNoteIdRef = useRef<string | null>(null);
  const openedNoteIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const structuredFocusTickRef = useRef(0);
  const sourceFocusTickRef = useRef(0);
  const handledRouteHeadingRef = useRef('');
  const handledRouteRangeRef = useRef('');
  const aiInputRef = useRef<TextInput>(null);

  markdownRef.current = markdown;
  titleRef.current = title;

  const noteQuery = useQuery({
    queryKey: id ? queryKeys.note(id) : ['note', 'missing'],
    queryFn: () => fetchNote(id!),
    enabled: Boolean(id),
    retry: 1,
  });
  const note = noteQuery.data;
  const backlinkQuery = useQuery({
    queryKey: [...queryKeys.notesAll, 'backlinks', id ?? '', title.trim()] as const,
    queryFn: () => loadBacklinksForTitle({
      fetchNotesPage: fetchNotes,
      fetchNoteById: fetchNote,
    }, title.trim(), id, { storage }),
    enabled: linksVisible && Boolean(title.trim()),
    staleTime: 60_000,
  });
  const wikiLinkQueryResult = useQuery({
    queryKey: ['notes', 'wiki-link-picker', wikiLinkQuery.trim()] as const,
    queryFn: () => fetchNotes({
      search: wikiLinkQuery.trim() || undefined,
      limit: 12,
      sortBy: wikiLinkQuery.trim() ? 'updatedAt' : 'lastOpenedAt',
      sortOrder: 'desc',
    }),
    enabled: wikiLinkVisible,
    staleTime: 30_000,
  });

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
      setTitle(nextTitle ?? deriveTitle(note, pm.untitledNote));
      setTags(nextTags);
      setNoteStatus(nextStatus);
      setSaveState(shouldUseLocal && localNote?.syncState === 'failed' ? 'failed' : shouldUseLocal && localNote?.syncState === 'pending' ? 'pending' : 'saved');
      if (isNewNote) {
        setMode(nextMarkdown.trim() ? 'read' : 'edit');
      }
    }

    upsertNoteInListCaches(queryClient, noteToIndexEntry(note));
  }, [note?.id, note?.localVersion, note?.markdown, note?.status, note?.tags, note?.text, note?.title, pm.untitledNote, queryClient]);

  useEffect(() => {
    if (!id || openedNoteIdRef.current === id) return;
    openedNoteIdRef.current = id;
    void recordNoteOpen(id).catch(() => undefined);
  }, [id]);

  const flushSave = useCallback(async () => {
    if (!id) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const nextMarkdown = markdownRef.current;
    const nextTitle = titleRef.current.trim() || undefined;
    if (
      nextMarkdown === serverMarkdownRef.current &&
      nextTitle === serverTitleRef.current &&
      tagsEqual(tags, serverTagsRef.current) &&
      noteStatus === serverStatusRef.current
    ) {
      dirtyRef.current = false;
      const localSnapshot = id ? readLocalNote(id) : null;
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

    if (!note) return;
    setSaveState('saving');
    const snapshot = saveLocalMarkdownNoteEdit(note, { markdown: nextMarkdown, title: nextTitle, tags, status: noteStatus });
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
  }, [id, note, noteStatus, pm.savedOffline, queryClient, tags]);

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

  const closeActiveSheet = useCallback(() => {
    if (wikiLinkVisible) {
      setWikiLinkVisible(false);
      return true;
    }
    if (searchVisible) {
      setSearchVisible(false);
      return true;
    }
    if (moreVisible) {
      setMoreVisible(false);
      return true;
    }
    if (outlineVisible) {
      setOutlineVisible(false);
      return true;
    }
    if (linksVisible) {
      setLinksVisible(false);
      return true;
    }
    if (aiDialogVisible) {
      setAiDialogVisible(false);
      setAiContextSnapshot(null);
      setPendingAiSuggestion(null);
      return true;
    }
    return false;
  }, [aiDialogVisible, linksVisible, moreVisible, outlineVisible, searchVisible, wikiLinkVisible]);

  const handleBack = useCallback(() => {
    if (closeActiveSheet()) return;
    Keyboard.dismiss();
    void flushSave();
    dismissOrHome(router);
  }, [closeActiveSheet, flushSave, router]);

  useDismissOnHardwareBack(router, { onBack: handleBack });

  const updateMarkdown = useCallback((next: string) => {
    dirtyRef.current = true;
    setSaveState('dirty');
    setMarkdown(next);
    scheduleSave();
  }, [scheduleSave]);

  const updateTitle = useCallback((next: string) => {
    dirtyRef.current = true;
    setSaveState('dirty');
    setTitle(next);
    scheduleSave();
  }, [scheduleSave]);

  const requestStructuredFocus = useCallback((range: SelectionRange) => {
    structuredFocusTickRef.current += 1;
    setSelection(range);
    setStructuredFocusSelection({ ...range, tick: structuredFocusTickRef.current });
  }, []);

  const requestSourceFocus = useCallback((range: SelectionRange) => {
    sourceFocusTickRef.current += 1;
    setSelection(range);
    setSourceFocusSelection({ ...range, tick: sourceFocusTickRef.current });
  }, []);

  const requestSourceRange = useCallback((start: number, end: number) => {
    requestSourceFocus({ start, end });
    setMode('source');
  }, [requestSourceFocus]);

  const openFullSource = useCallback(() => {
    requestSourceRange(0, markdownRef.current.length);
  }, [requestSourceRange]);

  const requestEditorFocus = useCallback((nextMarkdown: string, range: SelectionRange) => {
    setSelection(range);
    if (mode === 'source') {
      requestSourceFocus(range);
      return;
    }
    if (mode === 'edit' && canFocusStructuredMarkdownRange(nextMarkdown, range)) {
      requestStructuredFocus(range);
    }
  }, [mode, requestSourceFocus, requestStructuredFocus]);

  const replaceSelection = useCallback((insert: string, opts?: { selectInserted?: boolean }) => {
    const current = markdownRef.current;
    const effectiveSelection = mode === 'source' ? selection : getVisibleMarkdownSelection(current, selection);
    const start = Math.max(0, Math.min(effectiveSelection.start, effectiveSelection.end, current.length));
    const end = Math.max(0, Math.min(Math.max(effectiveSelection.start, effectiveSelection.end), current.length));
    const next = `${current.slice(0, start)}${insert}${current.slice(end)}`;
    dirtyRef.current = true;
    setSaveState('dirty');
    setMarkdown(next);
    const caret = start + insert.length;
    requestEditorFocus(next, { start: opts?.selectInserted ? start : caret, end: caret });
    scheduleSave();
  }, [mode, requestEditorFocus, scheduleSave, selection]);

  const wrapSelection = useCallback((before: string, after = before) => {
    const current = markdownRef.current;
    const effectiveSelection = mode === 'source' ? selection : getVisibleMarkdownSelection(current, selection);
    const result = wrapMarkdownSelection(current, effectiveSelection, before, after);
    dirtyRef.current = true;
    setSaveState('dirty');
    setMarkdown(result.markdown);
    requestEditorFocus(result.markdown, result.selection);
    scheduleSave();
  }, [mode, requestEditorFocus, scheduleSave, selection]);

  const insertLineTemplate = useCallback((template: string, placeholderOffset = template.length, useSelectionAsContent = false) => {
    const current = markdownRef.current;
    const effectiveSelection = mode === 'source' ? selection : getVisibleMarkdownSelection(current, selection);
    const result = insertMarkdownLineTemplate(current, effectiveSelection, template, placeholderOffset, { useSelectionAsContent });
    dirtyRef.current = true;
    setSaveState('dirty');
    setMarkdown(result.markdown);
    requestEditorFocus(result.markdown, result.selection);
    scheduleSave();
  }, [mode, requestEditorFocus, scheduleSave, selection]);

  const insertPrefixedLines = useCallback((prefixForLine: string | ((lineIndex: number) => string), placeholderOffset?: number) => {
    const current = markdownRef.current;
    const effectiveSelection = mode === 'source' ? selection : getVisibleMarkdownSelection(current, selection);
    const result = insertMarkdownPrefixedLines(current, effectiveSelection, prefixForLine, placeholderOffset);
    dirtyRef.current = true;
    setSaveState('dirty');
    setMarkdown(result.markdown);
    requestEditorFocus(result.markdown, result.selection);
    scheduleSave();
  }, [mode, requestEditorFocus, scheduleSave, selection]);

  const insertHeading = useCallback(() => {
    const current = markdownRef.current;
    const effectiveSelection = mode === 'source' ? selection : getVisibleMarkdownSelection(current, selection);
    const result = insertMarkdownHeading(current, effectiveSelection, 2);
    dirtyRef.current = true;
    setSaveState('dirty');
    setMarkdown(result.markdown);
    requestEditorFocus(result.markdown, result.selection);
    scheduleSave();
  }, [mode, requestEditorFocus, scheduleSave, selection]);

  const insertCodeBlock = useCallback(() => {
    const current = markdownRef.current;
    const effectiveSelection = mode === 'source' ? selection : getVisibleMarkdownSelection(current, selection);
    const result = insertMarkdownCodeBlock(current, effectiveSelection);
    dirtyRef.current = true;
    setSaveState('dirty');
    setMarkdown(result.markdown);
    requestEditorFocus(result.markdown, result.selection);
    scheduleSave();
  }, [mode, requestEditorFocus, scheduleSave, selection]);

  const insertCallout = useCallback(() => {
    const current = markdownRef.current;
    const effectiveSelection = mode === 'source' ? selection : getVisibleMarkdownSelection(current, selection);
    const result = insertMarkdownCallout(current, effectiveSelection);
    dirtyRef.current = true;
    setSaveState('dirty');
    setMarkdown(result.markdown);
    requestEditorFocus(result.markdown, result.selection);
    scheduleSave();
  }, [mode, requestEditorFocus, scheduleSave, selection]);

  const insertStandardLink = useCallback(() => {
    const current = markdownRef.current;
    const effectiveSelection = mode === 'source' ? selection : getVisibleMarkdownSelection(current, selection);
    const result = insertMarkdownLink(current, effectiveSelection);
    dirtyRef.current = true;
    setSaveState('dirty');
    setMarkdown(result.markdown);
    requestEditorFocus(result.markdown, result.selection);
    scheduleSave();
  }, [mode, requestEditorFocus, scheduleSave, selection]);

  const openWikiLinkPicker = useCallback(() => {
    const current = markdownRef.current;
    const effectiveSelection = mode === 'source' ? selection : getVisibleMarkdownSelection(current, selection);
    const start = Math.max(0, Math.min(effectiveSelection.start, effectiveSelection.end, current.length));
    const end = Math.max(0, Math.min(Math.max(effectiveSelection.start, effectiveSelection.end), current.length));
    setWikiLinkQuery(current.slice(start, end).replace(/\s+/g, ' ').trim());
    setWikiLinkVisible(true);
  }, [mode, selection]);

  const insertWikiLink = useCallback((target: string) => {
    const trimmed = target.trim();
    if (!trimmed) return;
    const current = markdownRef.current;
    const effectiveSelection = mode === 'source' ? selection : getVisibleMarkdownSelection(current, selection);
    const start = Math.max(0, Math.min(effectiveSelection.start, effectiveSelection.end, current.length));
    const end = Math.max(0, Math.min(Math.max(effectiveSelection.start, effectiveSelection.end), current.length));
    const selectedLabel = current.slice(start, end);
    replaceSelection(formatWikiLink(trimmed, selectedLabel));
    setWikiLinkVisible(false);
    setWikiLinkQuery('');
  }, [mode, replaceSelection, selection]);

  const enterEditMode = useCallback(() => {
    setMode('edit');
    setEditFocusTick((tick) => tick + 1);
  }, []);

  const openSearchFromMore = useCallback(() => {
    setMoreVisible(false);
    requestAnimationFrame(() => setSearchVisible(true));
  }, []);

  const handleShare = useCallback(async () => {
    await flushSave();
    const body = markdownRef.current;
    if (!body.trim()) return;
    if (Share.share) await Share.share({ message: body });
    else await Clipboard.setStringAsync(body);
  }, [flushSave]);

  const handleMarkdownLinkPress = useCallback((url: string) => {
    const noteLink = parseInternalNoteUrl(url);
    if (!noteLink) {
      void Linking.openURL(url);
      return;
    }
    void (async () => {
      try {
        const result = await fetchNotes({ search: noteLink.title, limit: 10 });
        const normalizedTarget = normalizeLinkTitle(noteLink.title);
        const targetNote = result.items.find((item) => normalizeLinkTitle(item.title ?? '') === normalizedTarget)
          ?? result.items[0];
        if (!targetNote) {
          setSnackMsg(t(pm.noteLinkNotFound, { title: noteLink.title }));
          return;
        }
        openNoteDetail(router, targetNote.id, { heading: noteLink.heading });
      } catch (error) {
        setSnackMsg(error instanceof Error ? error.message : pm.actionFailed);
      }
    })();
  }, [pm.actionFailed, pm.noteLinkNotFound, router]);

  const handlePickImage = useCallback(async () => {
    if (!id) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setSnackMsg(pm.editorAttachmentPermissionDenied);
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, base64: false });
    if (picked.canceled || !picked.assets[0]?.uri) return;
    try {
      await flushSave();
      const asset = picked.assets[0];
      const name = asset.fileName ?? `image-${Date.now()}.jpg`;
      const mimeType = asset.mimeType ?? 'image/jpeg';
      const attachment = await uploadNoteMedia(id, { localUri: asset.uri, name, mimeType });
      const imageMarkdown = formatMarkdownImage(name, noteAttachmentRef(id, attachment.id));
      insertLineTemplate(imageMarkdown);
      setSnackMsg(pm.editorAttachmentAdded);
    } catch (error) {
      setSnackMsg(error instanceof Error ? error.message : pm.actionFailed);
    }
  }, [flushSave, id, insertLineTemplate, pm.actionFailed, pm.editorAttachmentAdded, pm.editorAttachmentPermissionDenied]);

  const previewAiPatch = useCallback((patch: NoteAiPatch, beforeMarkdown = markdownRef.current) => {
    const result = applyMarkdownPatchResult(beforeMarkdown, patch.operations);
    setPendingAiSuggestion({
      patch,
      beforeMarkdown,
      result,
      preview: getMarkdownPatchPreviewSnippets(beforeMarkdown, result.markdown),
      changedRange: getMarkdownPatchChangedRange(beforeMarkdown, result.markdown),
    });
  }, []);

  const applyPendingAiSuggestion = useCallback(() => {
    if (!pendingAiSuggestion) return;
    const next = pendingAiSuggestion.result.markdown;
    const metadata = pendingAiSuggestion.result.metadata;
    const nextTitle = metadata.title;
    const beforeUndoMarkdown = markdownRef.current;
    setUndoSnapshot({
      markdown: beforeUndoMarkdown,
      title: titleRef.current,
      tags,
      status: noteStatus,
      focusRange: getMarkdownPatchChangedRange(next, beforeUndoMarkdown),
    });
    dirtyRef.current = true;
    setSaveState('dirty');
    setMarkdown(next);
    if (nextTitle !== undefined) setTitle(nextTitle ?? '');
    if (metadata.tags !== undefined) setTags(metadata.tags);
    if (metadata.status !== undefined) setNoteStatus(metadata.status);
    if (pendingAiSuggestion.changedRange && !isMarkdownRangeInFrontmatter(next, pendingAiSuggestion.changedRange)) {
      if (canFocusStructuredMarkdownRange(next, pendingAiSuggestion.changedRange)) {
        requestStructuredFocus(pendingAiSuggestion.changedRange);
        setMode('edit');
      } else {
        requestSourceRange(pendingAiSuggestion.changedRange.start, pendingAiSuggestion.changedRange.end);
      }
    }
    scheduleSave();
    setPendingAiSuggestion(null);
    setAiContextSnapshot(null);
    setAiDialogVisible(false);
    setSnackMsg(pendingAiSuggestion.patch.summary || pm.aiSuggestionApplied);
  }, [noteStatus, pendingAiSuggestion, pm.aiSuggestionApplied, requestSourceRange, requestStructuredFocus, scheduleSave, tags]);

  const discardPendingAiSuggestion = useCallback(() => {
    setPendingAiSuggestion(null);
  }, []);

  const undoAiSuggestion = useCallback(() => {
    if (undoSnapshot == null) return;
    dirtyRef.current = true;
    setSaveState('dirty');
    setMarkdown(undoSnapshot.markdown);
    setTitle(undoSnapshot.title);
    setTags(undoSnapshot.tags);
    setNoteStatus(undoSnapshot.status);
    if (undoSnapshot.focusRange && !isMarkdownRangeInFrontmatter(undoSnapshot.markdown, undoSnapshot.focusRange)) {
      if (canFocusStructuredMarkdownRange(undoSnapshot.markdown, undoSnapshot.focusRange)) {
        requestStructuredFocus(undoSnapshot.focusRange);
        setMode('edit');
      } else {
        requestSourceRange(undoSnapshot.focusRange.start, undoSnapshot.focusRange.end);
      }
    }
    setUndoSnapshot(null);
    scheduleSave();
    setSnackMsg(pm.aiSuggestionUndone);
  }, [pm.aiSuggestionUndone, requestSourceRange, requestStructuredFocus, scheduleSave, undoSnapshot]);

  const dismissAiDialog = useCallback(() => {
    setAiDialogVisible(false);
    setAiContextSnapshot(null);
    setPendingAiSuggestion(null);
  }, []);

  const buildAiContextSnapshot = useCallback((source: string): AiContextSnapshot => {
    if (mode === 'read') {
      return {
        markdown: source,
        context: getWholeMarkdownAiContext(source),
      };
    }
    const contextSelection = mode === 'source' ? selection : getVisibleMarkdownSelection(source, selection);
    return {
      markdown: source,
      context: getMarkdownAiContext(source, contextSelection),
    };
  }, [mode, selection]);

  const openAiDialog = useCallback(() => {
    setAiContextSnapshot(buildAiContextSnapshot(markdownRef.current));
    setPendingAiSuggestion(null);
    setAiDialogVisible(true);
    requestAnimationFrame(() => aiInputRef.current?.focus());
  }, [buildAiContextSnapshot]);

  const runAiEdit = useCallback(async () => {
    if (!id || !aiInstruction.trim()) return;
    const requestContext = aiContextSnapshot ?? buildAiContextSnapshot(markdownRef.current);
    setAiLoading(true);
    try {
      await flushSave();
      const result = await requestNoteAiEdit(id, {
        instruction: aiInstruction.trim(),
        markdown: requestContext.markdown,
        context: requestContext.context,
      });
      previewAiPatch(result.patch, requestContext.markdown);
      setAiInstruction('');
    } catch (error) {
      setSnackMsg(error instanceof Error ? error.message : pm.aiEditFailed);
    } finally {
      setAiLoading(false);
    }
  }, [aiContextSnapshot, aiInstruction, buildAiContextSnapshot, flushSave, id, pm.aiEditFailed, previewAiPatch]);

  const handleAiInputSubmit = useCallback(() => {
    if (aiLoading || !aiInstruction.trim()) return;
    Keyboard.dismiss();
    void runAiEdit();
  }, [aiInstruction, aiLoading, runAiEdit]);

  const archiveNote = useCallback(async () => {
    if (!id || !note) return;
    await flushSave();
    try {
      const updated = await updateNote(id, { status: 'archived' });
      queryClient.setQueryData(queryKeys.note(id), updated);
      void invalidateNoteLists(queryClient);
      dismissOrHome(router);
    } catch (error) {
      setSnackMsg(error instanceof Error ? error.message : pm.actionFailed);
    }
  }, [flushSave, id, note, pm.actionFailed, queryClient, router]);

  const toolbarActions = useMemo((): BlockInsertAction[] => [
    { key: 'heading', icon: 'format-header-2', label: pm.editorBlockHeading, groupLabel: pm.editorToolbarBlocks, onPress: insertHeading },
    { key: 'todo', icon: 'checkbox-marked-outline', label: pm.editorBlockTodo, groupLabel: pm.editorToolbarBlocks, onPress: () => insertPrefixedLines('- [ ] ', 6) },
    { key: 'bullet', icon: 'format-list-bulleted', label: pm.editorBlockBulletList, groupLabel: pm.editorToolbarBlocks, onPress: () => insertPrefixedLines('- ') },
    { key: 'numbered', icon: 'format-list-numbered', label: pm.editorBlockNumberedList, groupLabel: pm.editorToolbarBlocks, onPress: () => insertPrefixedLines((index) => `${index + 1}. `, 3) },
    { key: 'quote', icon: 'format-quote-close', label: pm.editorBlockQuote, groupLabel: pm.editorToolbarBlocks, onPress: () => insertPrefixedLines('> ') },
    { key: 'callout', icon: 'alert-circle-outline', label: pm.editorBlockCallout, groupLabel: pm.editorToolbarBlocks, onPress: insertCallout },
    { key: 'codeblock', icon: 'code-braces', label: pm.editorBlockCode, groupLabel: pm.editorToolbarBlocks, onPress: insertCodeBlock },
    { key: 'bold', icon: 'format-bold', label: pm.editorFormatBold, groupLabel: pm.editorToolbarFormat, onPress: () => wrapSelection('**') },
    { key: 'italic', icon: 'format-italic', label: pm.editorFormatItalic, groupLabel: pm.editorToolbarFormat, onPress: () => wrapSelection('_') },
    { key: 'code', icon: 'code-tags', label: pm.editorFormatCode, groupLabel: pm.editorToolbarFormat, onPress: () => wrapSelection('`') },
    { key: 'link', icon: 'link-variant', label: pm.editorInsertLink, groupLabel: pm.editorToolbarLinks, onPress: insertStandardLink },
    { key: 'wikilink', icon: 'link-box-outline', label: pm.editorInsertWikiLink, groupLabel: pm.editorToolbarLinks, onPress: openWikiLinkPicker },
    { key: 'image', icon: 'image-outline', label: pm.editorInsertImage, groupLabel: pm.editorToolbarLinks, onPress: () => void handlePickImage() },
    { key: 'ai', icon: 'creation-outline', label: pm.aiSuggestionTitle, groupLabel: pm.editorToolbarAi, onPress: openAiDialog },
  ], [handlePickImage, insertCallout, insertCodeBlock, insertHeading, insertLineTemplate, insertPrefixedLines, insertStandardLink, openAiDialog, openWikiLinkPicker, pm, wrapSelection]);

  const structuredBlockAccessibilityLabels = useMemo(() => ({
    paragraph: pm.editorBlockParagraph,
    heading: pm.editorBlockHeading,
    todo: pm.editorBlockTodo,
    bulletList: pm.editorBlockBulletList,
    numberedList: pm.editorBlockNumberedList,
    quote: pm.editorBlockQuote,
    callout: pm.editorBlockCallout,
    code: pm.editorBlockCode,
    raw: pm.modeSource,
  }), [pm.editorBlockBulletList, pm.editorBlockCallout, pm.editorBlockCode, pm.editorBlockHeading, pm.editorBlockNumberedList, pm.editorBlockParagraph, pm.editorBlockQuote, pm.editorBlockTodo, pm.modeSource]);
  const unsupportedMarkdownLabels = useMemo(() => ({
    title: pm.editorUnsupportedMarkdownTitle,
    description: pm.editorUnsupportedMarkdownDescription,
    action: pm.editorUnsupportedMarkdownAction,
    count: pm.editorUnsupportedMarkdownCount,
  }), [pm.editorUnsupportedMarkdownAction, pm.editorUnsupportedMarkdownCount, pm.editorUnsupportedMarkdownDescription, pm.editorUnsupportedMarkdownTitle]);

  const previewMarkdown = useMemo(
    () => renderWikiLinksToMarkdown(renderObsidianCalloutsToMarkdown(stripMarkdownFrontmatter(markdownForPreview(markdown)))),
    [markdown],
  );
  const outlineItems = useMemo(() => getMarkdownOutline(markdown), [markdown]);
  const outgoingLinks = useMemo(() => extractMarkdownWikiLinks(markdown), [markdown]);
  const searchMatches = useMemo(() => findMarkdownMatches(markdown, searchQuery), [markdown, searchQuery]);
  const aiContext = useMemo(
    () => aiContextSnapshot?.context ?? buildAiContextSnapshot(markdown).context,
    [aiContextSnapshot, buildAiContextSnapshot, markdown],
  );
  const exactBacklinks = backlinkQuery.data ?? [];
  const wikiLinkCandidates = wikiLinkQueryResult.data?.items ?? [];
  const wikiLinkTrimmedQuery = wikiLinkQuery.trim();
  const showLoading = noteQuery.isLoading && !note;
  const showError = noteQuery.isError && !note;
  const saveLabel = saveState === 'saving'
    ? pm.saving
    : saveState === 'failed'
      ? pm.saveFailed
      : saveState === 'pending'
        ? pm.savedOffline
      : saveState === 'dirty'
        ? pm.savePending
        : pm.saved;
  const statusText = statusDisplayLabel(noteStatus, pm);
  const aiContextLabel = aiContext.type === 'selection'
    ? pm.aiContextSelection
    : aiContext.type === 'section'
      ? t(pm.aiContextSection, { heading: aiContext.heading })
      : aiContext.type === 'block'
        ? pm.aiContextBlock
        : pm.aiContextNote;
  const aiContextScopeLabel = mode === 'source'
    ? pm.aiContextScopeSource
    : aiContext.type === 'selection'
      ? pm.aiContextScopeSelection
      : aiContext.type === 'section'
        ? pm.aiContextScopeSection
        : aiContext.type === 'block'
          ? pm.aiContextScopeBlock
          : pm.aiContextScopeNote;
  const aiContextPreview = useMemo(() => summarizeMarkdownAiContext(aiContext), [aiContext]);
  const aiQuickActions = useMemo(() => {
    if (aiContext.type === 'selection') {
      return [pm.aiPromptRewrite, pm.aiPromptShorten, pm.aiPromptExtractTodos];
    }
    if (aiContext.type === 'section') {
      return [pm.aiPromptSummarizeSection, pm.aiPromptOrganizeSection, pm.aiPromptExtractTodos];
    }
    if (aiContext.type === 'block') {
      return [pm.aiPromptRewrite, pm.aiPromptShorten, pm.aiPromptExtractTodos];
    }
    return [pm.aiPromptOrganize, pm.aiPromptExtractTodos, pm.aiPromptTitleTags, pm.aiPromptSummarize];
  }, [aiContext.type, pm.aiPromptExtractTodos, pm.aiPromptOrganize, pm.aiPromptOrganizeSection, pm.aiPromptRewrite, pm.aiPromptShorten, pm.aiPromptSummarize, pm.aiPromptSummarizeSection, pm.aiPromptTitleTags]);

  useEffect(() => {
    if (!id || !note || routeRangeStart == null || routeRangeEnd == null) return;
    const sourceLength = markdown.length;
    const start = Math.max(0, Math.min(routeRangeStart, routeRangeEnd, sourceLength));
    const end = Math.max(0, Math.min(Math.max(routeRangeStart, routeRangeEnd), sourceLength));
    const key = `${id}:${start}:${end}:${sourceLength}`;
    if (handledRouteRangeRef.current === key) return;
    handledRouteRangeRef.current = key;
    const range = { start, end };
    if (canFocusStructuredMarkdownRange(markdown, range)) {
      requestStructuredFocus(range);
      setMode('edit');
    } else {
      requestSourceRange(start, end);
    }
  }, [id, markdown, note, requestSourceRange, requestStructuredFocus, routeRangeEnd, routeRangeStart]);

  useEffect(() => {
    const target = routeHeading?.trim();
    if (!id || !target || !outlineItems.length) return;
    const key = `${id}:${target}`;
    if (handledRouteHeadingRef.current === key) return;
    const normalizedTarget = normalizeHeadingTarget(target);
    const targetHeading = outlineItems.find((item) => (
      item.id === target
      || normalizeHeadingTarget(item.title) === normalizedTarget
    ));
    if (!targetHeading) return;
    handledRouteHeadingRef.current = key;
    requestStructuredFocus({ start: targetHeading.range.start, end: targetHeading.range.end });
    setMode('edit');
  }, [id, outlineItems, requestStructuredFocus, routeHeading]);

  const handleDone = useCallback(() => {
    Keyboard.dismiss();
    void flushSave();
    setMode(markdownRef.current.trim() ? 'read' : 'edit');
  }, [flushSave]);

  const rightActions = useMemo(() => {
    if (!note) return undefined;
    if (mode === 'read') {
      return undefined;
    }
    const undoAction = undoSnapshot != null
      ? [{ icon: 'undo', label: pm.editorUndo, onPress: undoAiSuggestion }]
      : [];
    return [
      ...undoAction,
      { icon: 'check', label: pm.done, onPress: handleDone },
    ];
  }, [handleDone, mode, note, pm.done, pm.editorUndo, undoAiSuggestion, undoSnapshot]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.surface.base }]}> 
      <NoteDetailHeader
        onBack={handleBack}
        backLabel={m.common.back}
        rightActions={rightActions}
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
      ) : note ? (
        <View style={styles.editorWrap}>
          <View style={styles.titleWrap}>
            {mode === 'read' ? (
              <Text style={[styles.titleText, { color: colors.text.primary }]}>
                {title.trim() || pm.untitledNote}
              </Text>
            ) : (
              <TextInput
                value={title}
                onChangeText={updateTitle}
                placeholder={pm.untitledNote}
                placeholderTextColor={colors.text.tertiary}
                accessibilityLabel={pm.aiMetadataNoteTitle}
                style={[styles.titleInput, { color: colors.text.primary }]}
              />
            )}
            <View style={styles.metaRow}>
              <Text
                style={[
                  styles.modeLabel,
                  {
                    color: saveState === 'failed'
                      ? colors.semantic.error
                      : saveState === 'saving' || saveState === 'dirty' || saveState === 'pending'
                        ? colors.text.secondary
                        : colors.text.tertiary,
                  },
                ]}
              >
                {saveLabel}
              </Text>
              {mode === 'source' ? (
                <>
                  <Text style={[styles.statusDot, { color: colors.text.disabled }]}>·</Text>
                  <Text style={[styles.modeLabel, { color: colors.text.tertiary }]}>
                    {pm.modeSource}
                  </Text>
                </>
              ) : null}
            </View>
            {(statusText || tags?.length) ? (
              <View style={styles.detailChipRow}>
                {!!statusText && (
                  <View style={[styles.detailChip, { backgroundColor: colors.surface.input, borderColor: colors.border.subtle }]}>
                    <Text style={[styles.detailChipText, { color: colors.text.secondary }]}>{statusText}</Text>
                  </View>
                )}
                {tags?.map((tag) => (
                  <View key={tag} style={[styles.detailChip, { backgroundColor: colors.accent.selectionBg, borderColor: colors.border.subtle }]}>
                    <Text style={[styles.detailChipText, { color: colors.accent.primary }]}>{tag}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
          {mode === 'read' ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.readContent}
              showsVerticalScrollIndicator={false}
            >
              {markdown.trim() ? (
                <MarkdownView content={previewMarkdown} allowTrailingMargin onLinkPress={handleMarkdownLinkPress} />
              ) : (
                <Pressable
                  style={[styles.emptyRead, { borderColor: colors.border.default, backgroundColor: colors.surface.panel }]}
                  onPress={enterEditMode}
                  accessibilityRole="button"
                  accessibilityLabel={pm.editorEmptyTapHint}
                >
                  <Icon source="file-document-edit-outline" size={32} color={colors.text.tertiary} />
                  <Text style={{ color: colors.text.tertiary }}>{pm.editorEmptyTapHint}</Text>
                </Pressable>
              )}
            </ScrollView>
          ) : mode === 'source' ? (
            <MarkdownNoteEditor
              markdown={markdown}
              previewMarkdown={previewMarkdown}
              mode="source"
              placeholder={pm.editorPlaceholderText}
              accessibilityLabel={pm.aiContextScopeSource}
              focusSelection={sourceFocusSelection}
              toolbarActions={toolbarActions}
              onChangeMarkdown={updateMarkdown}
              onSelectionChange={(start, end) => setSelection({ start, end })}
            />
          ) : (
            <StructuredMarkdownEditor
              markdown={markdown}
              placeholder={pm.editorPlaceholderText}
              todoAccessibilityLabel={pm.editorBlockTodo}
              blockAccessibilityLabels={structuredBlockAccessibilityLabels}
              unsupportedMarkdownLabels={unsupportedMarkdownLabels}
              autoFocusTick={editFocusTick}
              focusSelection={structuredFocusSelection}
              toolbarActions={toolbarActions}
              onChangeMarkdown={updateMarkdown}
              onSelectionChange={(start, end) => setSelection({ start, end })}
              onRequestSourceRange={requestSourceRange}
              onOpenSource={openFullSource}
              resolveImageSource={resolvePreviewImageSrc}
            />
          )}
        </View>
      ) : null}

      {note && mode === 'read' ? (
        <View
          style={[
            styles.floatingActionDock,
            {
              bottom: Math.max(insets.bottom, 12) + 12,
              backgroundColor: colors.surface.panel,
              borderColor: colors.border.default,
            },
          ]}
        >
          <Pressable
            onPress={openAiDialog}
            accessibilityRole="button"
            accessibilityLabel={pm.aiSuggestionTitle}
            style={({ pressed }) => [
              styles.floatingActionButton,
              { backgroundColor: pressed ? colors.surface.hover : 'transparent' },
            ]}
          >
            <Icon source="creation-outline" size={21} color={colors.text.secondary} />
          </Pressable>
          <Pressable
            onPress={enterEditMode}
            accessibilityRole="button"
            accessibilityLabel={pm.edit}
            style={({ pressed }) => [
              styles.floatingActionButton,
              { backgroundColor: pressed ? colors.surface.hover : 'transparent' },
            ]}
          >
            <Icon source="pencil-outline" size={21} color={colors.text.secondary} />
          </Pressable>
          <Pressable
            onPress={() => setMoreVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={pm.viewMore}
            style={({ pressed }) => [
              styles.floatingActionButton,
              { backgroundColor: pressed ? colors.surface.hover : 'transparent' },
            ]}
          >
            <Icon source="dots-horizontal" size={21} color={colors.text.secondary} />
          </Pressable>
        </View>
      ) : null}

      <Modal
        visible={aiDialogVisible}
        transparent
        animationType="slide"
        onRequestClose={dismissAiDialog}
      >
        <KeyboardAvoidingView
          style={styles.aiSheetRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.aiSheetBackdrop} onPress={dismissAiDialog} accessible={false} />
          <View
            style={[
              styles.aiSheet,
              {
                backgroundColor: colors.surface.panel,
                borderColor: colors.border.default,
                paddingBottom: Math.max(insets.bottom, 14),
              },
            ]}
          >
            <View style={[styles.aiSheetHandle, { backgroundColor: colors.border.strong }]} />
            <View style={styles.aiSheetHeader}>
              <View style={styles.aiSheetTitleWrap}>
                <Text style={[styles.aiSheetTitle, { color: colors.text.primary }]}>{pm.aiSuggestionTitle}</Text>
                <Text style={[styles.aiSheetSubtitle, { color: colors.text.tertiary }]}>
                  {pendingAiSuggestion ? pm.aiSuggestionReady : aiContextLabel}
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.aiSheetClose, pressed && { backgroundColor: colors.surface.hover }]}
                onPress={dismissAiDialog}
                accessibilityRole="button"
                accessibilityLabel={m.common.cancel}
              >
                <Icon source="close" size={20} color={colors.text.secondary} />
              </Pressable>
            </View>

            {pendingAiSuggestion ? (
              <ScrollView style={styles.aiPreviewScroll} contentContainerStyle={styles.aiPreviewContent}>
                <Text style={[styles.aiPreviewSummary, { color: colors.text.primary }]}>
                  {pendingAiSuggestion.patch.summary || pm.aiSuggestionReady}
                </Text>
                <Text style={[styles.aiPreviewMeta, { color: colors.text.tertiary }]}>
                  {t(pm.aiOperationCount, { count: pendingAiSuggestion.patch.operations.length })}
                </Text>
                {hasAiMetadata(pendingAiSuggestion.result.metadata) ? (
                  <View style={[styles.aiPreviewBox, { borderColor: colors.border.default, backgroundColor: colors.accent.selectionBg }]}>
                    <Text style={[styles.aiPreviewLabel, { color: colors.accent.primary }]}>{pm.aiMetadataTitle}</Text>
                    {pendingAiSuggestion.result.metadata.title !== undefined ? (
                      <Text style={[styles.aiPreviewText, { color: colors.text.primary }]}>
                        {pm.aiMetadataNoteTitle}: {pendingAiSuggestion.result.metadata.title || pm.untitledNote}
                      </Text>
                    ) : null}
                    {pendingAiSuggestion.result.metadata.tags !== undefined ? (
                      <Text style={[styles.aiPreviewText, { color: colors.text.primary }]}>
                        {pm.aiMetadataTags}: {pendingAiSuggestion.result.metadata.tags.join(', ') || pm.tagUntaggedHint}
                      </Text>
                    ) : null}
                    {pendingAiSuggestion.result.metadata.status !== undefined ? (
                      <Text style={[styles.aiPreviewText, { color: colors.text.primary }]}>
                        {pm.aiMetadataStatus}: {statusDisplayLabel(pendingAiSuggestion.result.metadata.status, pm) ?? pm.filterProcessed}
                      </Text>
                    ) : null}
                    {pendingAiSuggestion.result.metadata.frontmatter !== undefined ? (
                      <Text style={[styles.aiPreviewText, { color: colors.text.primary }]} numberOfLines={3}>
                        {pm.aiMetadataFrontmatter}: {formatFrontmatterPreview(pendingAiSuggestion.result.metadata.frontmatter)}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                <View style={styles.aiPreviewSectionHeader}>
                  <Text style={[styles.aiPreviewLabel, { color: colors.text.tertiary }]}>{pm.aiContentChanges}</Text>
                  <Text style={[styles.aiPreviewMeta, { color: colors.text.tertiary }]}>
                    {aiContextScopeLabel}
                  </Text>
                </View>
                {pendingAiSuggestion.preview.changed ? (
                  <>
                    <View style={[styles.aiPreviewBox, { borderColor: colors.border.subtle, backgroundColor: colors.surface.input }]}>
                      <Text style={[styles.aiPreviewLabel, { color: colors.text.tertiary }]}>{pm.aiPreviewBefore}</Text>
                      <Text style={[styles.aiPreviewText, { color: colors.text.secondary }]} numberOfLines={6}>
                        {pendingAiSuggestion.preview.before || pm.editorPlaceholderText}
                      </Text>
                    </View>
                    <View style={[styles.aiPreviewBox, { borderColor: colors.border.default, backgroundColor: colors.surface.panel }]}>
                      <Text style={[styles.aiPreviewLabel, { color: colors.accent.primary }]}>{pm.aiPreviewAfter}</Text>
                      <Text style={[styles.aiPreviewText, { color: colors.text.primary }]} numberOfLines={8}>
                        {pendingAiSuggestion.preview.after || pm.editorPlaceholderText}
                      </Text>
                    </View>
                  </>
                ) : (
                  <View style={[styles.aiPreviewBox, { borderColor: colors.border.subtle, backgroundColor: colors.surface.input }]}>
                    <Text style={[styles.aiPreviewText, { color: colors.text.secondary }]}>
                      {pm.aiNoContentChanges}
                    </Text>
                  </View>
                )}
              </ScrollView>
            ) : (
              <View style={styles.aiComposeWrap}>
                <View style={styles.aiScopeRow}>
                  <Text style={[styles.aiPreviewLabel, { color: colors.text.tertiary }]}>{pm.aiContextScope}</Text>
                  <View style={[styles.aiScopePill, { borderColor: colors.border.default, backgroundColor: colors.accent.selectionBg }]}>
                    <Icon source={mode === 'source' ? 'code-braces' : aiContext.type === 'note' ? 'file-document-outline' : aiContext.type === 'section' ? 'format-header-2' : aiContext.type === 'block' ? 'cube-outline' : 'selection'} size={15} color={colors.accent.primary} />
                    <Text style={[styles.aiScopePillText, { color: colors.accent.primary }]} numberOfLines={1}>
                      {aiContextScopeLabel}
                    </Text>
                  </View>
                </View>
                {aiContextPreview ? (
                  <View style={[styles.aiContextPreview, { borderColor: colors.border.subtle, backgroundColor: colors.surface.input }]}>
                    <Text style={[styles.aiPreviewLabel, { color: colors.text.tertiary }]}>{pm.aiContextPreview}</Text>
                    <Text style={[styles.aiPreviewText, { color: colors.text.secondary }]} numberOfLines={3}>
                      {aiContextPreview}
                    </Text>
                  </View>
                ) : null}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.aiQuickActionRow}>
                  {aiQuickActions.map((label) => {
                    const selected = aiInstruction === label;
                    return (
                      <Pressable
                        key={label}
                        style={({ pressed }) => [
                          styles.aiQuickAction,
                          {
                            borderColor: colors.border.default,
                            backgroundColor: pressed || selected ? colors.accent.selectionBg : colors.surface.panel,
                          },
                        ]}
                        onPress={() => setAiInstruction(label)}
                        accessibilityRole="button"
                        accessibilityLabel={label}
                        accessibilityState={{ selected }}
                      >
                        <Text style={[styles.aiQuickActionText, { color: selected ? colors.accent.primary : colors.text.secondary }]}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <TextInput
                  ref={aiInputRef}
                  value={aiInstruction}
                  onChangeText={setAiInstruction}
                  placeholder={pm.aiInputPlaceholder}
                  placeholderTextColor={colors.text.tertiary}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  accessibilityLabel={pm.aiInputPlaceholder}
                  returnKeyType="send"
                  onSubmitEditing={handleAiInputSubmit}
                  blurOnSubmit
                  style={[styles.aiInput, { color: colors.text.primary, borderColor: colors.border.default, backgroundColor: colors.surface.input }]}
                />
              </View>
            )}

            <View style={styles.aiSheetActions}>
              {pendingAiSuggestion ? (
                <>
                  <Button mode="outlined" onPress={discardPendingAiSuggestion}>{pm.aiDiscard}</Button>
                  <Button mode="contained" onPress={applyPendingAiSuggestion}>{pm.aiApply}</Button>
                </>
              ) : (
                <>
                  <Button mode="outlined" onPress={dismissAiDialog}>{m.common.cancel}</Button>
                  <Button mode="contained" loading={aiLoading} disabled={aiLoading || !aiInstruction.trim()} onPress={() => void runAiEdit()}>{pm.aiGeneratePreview}</Button>
                </>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={moreVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setMoreVisible(false)}
      >
        <View style={styles.aiSheetRoot}>
          <Pressable style={styles.aiSheetBackdrop} onPress={() => setMoreVisible(false)} accessible={false} />
          <View
            style={[
              styles.moreSheet,
              {
                backgroundColor: colors.surface.panel,
                borderColor: colors.border.default,
                paddingBottom: Math.max(insets.bottom, 14),
              },
            ]}
          >
            <View style={[styles.aiSheetHandle, { backgroundColor: colors.border.strong }]} />
            <View style={styles.aiSheetHeader}>
              <View style={styles.aiSheetTitleWrap}>
                <Text style={[styles.aiSheetTitle, { color: colors.text.primary }]}>{pm.viewMore}</Text>
                <Text style={[styles.aiSheetSubtitle, { color: colors.text.tertiary }]}>
                  {title.trim() || pm.untitledNote}
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.aiSheetClose, pressed && { backgroundColor: colors.surface.hover }]}
                onPress={() => setMoreVisible(false)}
                accessibilityRole="button"
                accessibilityLabel={m.common.cancel}
              >
                <Icon source="close" size={20} color={colors.text.secondary} />
              </Pressable>
            </View>
            <View style={styles.moreActionList}>
              <Pressable
                style={({ pressed }) => [styles.moreActionRow, { backgroundColor: pressed ? colors.surface.hover : colors.surface.panel }]}
                onPress={openSearchFromMore}
                accessibilityRole="button"
                accessibilityLabel={pm.searchInNote}
              >
                <Icon source="magnify" size={20} color={colors.text.secondary} />
                <Text style={[styles.moreActionText, { color: colors.text.primary }]}>{pm.searchInNote}</Text>
              </Pressable>
              {outlineItems.length > 0 ? (
                <Pressable
                  style={({ pressed }) => [styles.moreActionRow, { backgroundColor: pressed ? colors.surface.hover : colors.surface.panel }]}
                  onPress={() => {
                    setMoreVisible(false);
                    setOutlineVisible(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={pm.outline}
                >
                  <Icon source="format-list-bulleted" size={20} color={colors.text.secondary} />
                  <Text style={[styles.moreActionText, { color: colors.text.primary }]}>{pm.outline}</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={({ pressed }) => [styles.moreActionRow, { backgroundColor: pressed ? colors.surface.hover : colors.surface.panel }]}
                onPress={() => {
                  setMoreVisible(false);
                  setLinksVisible(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={pm.links}
              >
                <Icon source="link-variant" size={20} color={colors.text.secondary} />
                <Text style={[styles.moreActionText, { color: colors.text.primary }]}>{pm.links}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.moreActionRow, { backgroundColor: pressed ? colors.surface.hover : colors.surface.panel }]}
                onPress={() => {
                  setMoreVisible(false);
                  setMode('source');
                }}
                accessibilityRole="button"
                accessibilityLabel={pm.modeSource}
              >
                <Icon source="code-braces" size={20} color={colors.text.secondary} />
                <Text style={[styles.moreActionText, { color: colors.text.primary }]}>{pm.modeSource}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.moreActionRow, { backgroundColor: pressed ? colors.surface.hover : colors.surface.panel }]}
                onPress={() => {
                  setMoreVisible(false);
                  void handleShare();
                }}
                accessibilityRole="button"
                accessibilityLabel={pm.viewShare}
              >
                <Icon source="share-outline" size={20} color={colors.text.secondary} />
                <Text style={[styles.moreActionText, { color: colors.text.primary }]}>{pm.viewShare}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.moreActionRow, { backgroundColor: pressed ? colors.surface.hover : colors.surface.panel }]}
                onPress={() => {
                  setMoreVisible(false);
                  void archiveNote();
                }}
                accessibilityRole="button"
                accessibilityLabel={pm.archive}
              >
                <Icon source="archive-outline" size={20} color={colors.text.secondary} />
                <Text style={[styles.moreActionText, { color: colors.text.primary }]}>{pm.archive}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={outlineVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setOutlineVisible(false)}
      >
        <View style={styles.aiSheetRoot}>
          <Pressable style={styles.aiSheetBackdrop} onPress={() => setOutlineVisible(false)} accessible={false} />
          <View
            style={[
              styles.outlineSheet,
              {
                backgroundColor: colors.surface.panel,
                borderColor: colors.border.default,
                paddingBottom: Math.max(insets.bottom, 14),
              },
            ]}
          >
            <View style={[styles.aiSheetHandle, { backgroundColor: colors.border.strong }]} />
            <View style={styles.aiSheetHeader}>
              <View style={styles.aiSheetTitleWrap}>
                <Text style={[styles.aiSheetTitle, { color: colors.text.primary }]}>{pm.outline}</Text>
                <Text style={[styles.aiSheetSubtitle, { color: colors.text.tertiary }]}>
                  {title.trim() || pm.untitledNote}
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.aiSheetClose, pressed && { backgroundColor: colors.surface.hover }]}
                onPress={() => setOutlineVisible(false)}
                accessibilityRole="button"
                accessibilityLabel={m.common.cancel}
              >
                <Icon source="close" size={20} color={colors.text.secondary} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.outlineList}>
              {outlineItems.map((item) => (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.outlineRow,
                    {
                      paddingLeft: 12 + (item.level - 1) * 14,
                      backgroundColor: pressed ? colors.surface.hover : colors.surface.panel,
                    },
                  ]}
                  onPress={() => {
                    requestStructuredFocus({ start: item.range.start, end: item.range.end });
                    setMode('edit');
                    setOutlineVisible(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                >
                  <Text style={[styles.outlineLevel, { color: colors.text.tertiary }]}>H{item.level}</Text>
                  <Text style={[styles.outlineTitle, { color: colors.text.primary }]} numberOfLines={2}>
                    {item.title}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={linksVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLinksVisible(false)}
      >
        <View style={styles.aiSheetRoot}>
          <Pressable style={styles.aiSheetBackdrop} onPress={() => setLinksVisible(false)} accessible={false} />
          <View
            style={[
              styles.outlineSheet,
              {
                backgroundColor: colors.surface.panel,
                borderColor: colors.border.default,
                paddingBottom: Math.max(insets.bottom, 14),
              },
            ]}
          >
            <View style={[styles.aiSheetHandle, { backgroundColor: colors.border.strong }]} />
            <View style={styles.aiSheetHeader}>
              <View style={styles.aiSheetTitleWrap}>
                <Text style={[styles.aiSheetTitle, { color: colors.text.primary }]}>{pm.links}</Text>
                <Text style={[styles.aiSheetSubtitle, { color: colors.text.tertiary }]}>
                  {t(pm.linkCounts, { outgoing: outgoingLinks.length, backlinks: exactBacklinks.length })}
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.aiSheetClose, pressed && { backgroundColor: colors.surface.hover }]}
                onPress={() => setLinksVisible(false)}
                accessibilityRole="button"
                accessibilityLabel={m.common.cancel}
              >
                <Icon source="close" size={20} color={colors.text.secondary} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.outlineList}>
              <Text style={[styles.linkSectionTitle, { color: colors.text.tertiary }]}>{pm.outgoingLinks}</Text>
              {outgoingLinks.length ? outgoingLinks.map((link) => {
                const params = new URLSearchParams({ title: link.target });
                if (link.heading) params.set('heading', link.heading);
                return (
                  <Pressable
                    key={`${link.range.start}_${link.target}_${link.heading ?? ''}`}
                    style={({ pressed }) => [
                      styles.searchResultRow,
                      { backgroundColor: pressed ? colors.surface.hover : colors.surface.panel },
                    ]}
                    onPress={() => {
                      setLinksVisible(false);
                      handleMarkdownLinkPress(`xopc-note://open?${params.toString()}`);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={link.label}
                  >
                    <Icon source="link-variant" size={18} color={colors.text.tertiary} />
                    <View style={styles.searchResultTextWrap}>
                      <Text style={[styles.searchResultQuery, { color: colors.text.primary }]} numberOfLines={1}>
                        {link.label}
                      </Text>
                      <Text style={[styles.searchResultSnippet, { color: colors.text.secondary }]} numberOfLines={1}>
                        {link.heading ? `${link.target} # ${link.heading}` : link.target}
                      </Text>
                    </View>
                  </Pressable>
                );
              }) : (
                <Text style={[styles.linkEmptyText, { color: colors.text.tertiary }]}>{pm.noOutgoingLinks}</Text>
              )}

              <Text style={[styles.linkSectionTitle, { color: colors.text.tertiary }]}>{pm.backlinks}</Text>
              {backlinkQuery.isFetching ? (
                <View style={styles.linkLoading}>
                  <ActivityIndicator color={colors.accent.primary} />
                </View>
              ) : exactBacklinks.length ? exactBacklinks.map((link) => (
                <Pressable
                  key={`${link.sourceNoteId}_${link.range.start}_${link.target}`}
                  style={({ pressed }) => [
                    styles.searchResultRow,
                    { backgroundColor: pressed ? colors.surface.hover : colors.surface.panel },
                  ]}
                  onPress={() => {
                    setLinksVisible(false);
                    openNoteDetail(router, link.sourceNoteId, { range: link.range });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={link.sourceTitle}
                >
                  <Icon source="link-box-outline" size={18} color={colors.text.tertiary} />
                  <View style={styles.searchResultTextWrap}>
                    <Text style={[styles.searchResultQuery, { color: colors.text.primary }]} numberOfLines={1}>
                      {link.sourceTitle}
                    </Text>
                    <Text style={[styles.searchResultSnippet, { color: colors.text.secondary }]} numberOfLines={2}>
                      {link.heading ? `${link.target} # ${link.heading}` : link.label}
                    </Text>
                  </View>
                </Pressable>
              )) : (
                <Text style={[styles.linkEmptyText, { color: colors.text.tertiary }]}>{pm.noBacklinks}</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={wikiLinkVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setWikiLinkVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.aiSheetRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.aiSheetBackdrop} onPress={() => setWikiLinkVisible(false)} accessible={false} />
          <View
            style={[
              styles.outlineSheet,
              {
                backgroundColor: colors.surface.panel,
                borderColor: colors.border.default,
                paddingBottom: Math.max(insets.bottom, 14),
              },
            ]}
          >
            <View style={[styles.aiSheetHandle, { backgroundColor: colors.border.strong }]} />
            <View style={styles.aiSheetHeader}>
              <View style={styles.aiSheetTitleWrap}>
                <Text style={[styles.aiSheetTitle, { color: colors.text.primary }]}>{pm.editorInsertWikiLink}</Text>
                <Text style={[styles.aiSheetSubtitle, { color: colors.text.tertiary }]}>
                  {wikiLinkTrimmedQuery ? t(pm.wikiLinkSearchSubtitle, { query: wikiLinkTrimmedQuery }) : pm.wikiLinkRecentSubtitle}
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.aiSheetClose, pressed && { backgroundColor: colors.surface.hover }]}
                onPress={() => setWikiLinkVisible(false)}
                accessibilityRole="button"
                accessibilityLabel={m.common.cancel}
              >
                <Icon source="close" size={20} color={colors.text.secondary} />
              </Pressable>
            </View>
            <TextInput
              value={wikiLinkQuery}
              onChangeText={setWikiLinkQuery}
              placeholder={pm.wikiLinkSearchPlaceholder}
              placeholderTextColor={colors.text.tertiary}
              autoFocus
              autoCapitalize="words"
              autoCorrect={false}
              accessibilityLabel={pm.wikiLinkSearchPlaceholder}
              returnKeyType="search"
              style={[styles.searchInput, { color: colors.text.primary, borderColor: colors.border.default, backgroundColor: colors.surface.input }]}
            />
            {wikiLinkTrimmedQuery ? (
              <Button
                mode="contained-tonal"
                icon="link-box-outline"
                onPress={() => insertWikiLink(wikiLinkTrimmedQuery)}
                style={styles.wikiLinkInsertButton}
              >
                {t(pm.wikiLinkInsertTyped, { title: wikiLinkTrimmedQuery })}
              </Button>
            ) : null}
            <ScrollView contentContainerStyle={styles.outlineList} keyboardShouldPersistTaps="handled">
              {wikiLinkQueryResult.isFetching ? (
                <View style={styles.linkLoading}>
                  <ActivityIndicator color={colors.accent.primary} />
                </View>
              ) : wikiLinkCandidates.length ? wikiLinkCandidates.map((item) => {
                const itemTitle = item.title?.trim() || item.snippet?.trim() || pm.untitledNote;
                return (
                  <Pressable
                    key={item.id}
                    style={({ pressed }) => [
                      styles.searchResultRow,
                      { backgroundColor: pressed ? colors.surface.hover : colors.surface.panel },
                    ]}
                    onPress={() => insertWikiLink(itemTitle)}
                    accessibilityRole="button"
                    accessibilityLabel={itemTitle}
                  >
                    <Icon source="file-document-outline" size={18} color={colors.text.tertiary} />
                    <View style={styles.searchResultTextWrap}>
                      <Text style={[styles.searchResultQuery, { color: colors.text.primary }]} numberOfLines={1}>
                        {itemTitle}
                      </Text>
                      <Text style={[styles.searchResultSnippet, { color: colors.text.secondary }]} numberOfLines={2}>
                        {item.snippet || formatWikiLink(itemTitle)}
                      </Text>
                    </View>
                  </Pressable>
                );
              }) : (
                <View style={styles.searchEmpty}>
                  <Icon source="link-box-outline" size={24} color={colors.text.tertiary} />
                  <Text style={[styles.searchEmptyText, { color: colors.text.tertiary }]}>{pm.wikiLinkNoResults}</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={searchVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSearchVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.aiSheetRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.aiSheetBackdrop} onPress={() => setSearchVisible(false)} accessible={false} />
          <View
            style={[
              styles.outlineSheet,
              {
                backgroundColor: colors.surface.panel,
                borderColor: colors.border.default,
                paddingBottom: Math.max(insets.bottom, 14),
              },
            ]}
          >
            <View style={[styles.aiSheetHandle, { backgroundColor: colors.border.strong }]} />
            <View style={styles.aiSheetHeader}>
              <View style={styles.aiSheetTitleWrap}>
                <Text style={[styles.aiSheetTitle, { color: colors.text.primary }]}>{pm.searchInNote}</Text>
                <Text style={[styles.aiSheetSubtitle, { color: colors.text.tertiary }]}>
                  {searchQuery.trim() ? t(pm.searchResultCount, { count: searchMatches.length }) : title.trim() || pm.untitledNote}
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.aiSheetClose, pressed && { backgroundColor: colors.surface.hover }]}
                onPress={() => setSearchVisible(false)}
                accessibilityRole="button"
                accessibilityLabel={m.common.cancel}
              >
                <Icon source="close" size={20} color={colors.text.secondary} />
              </Pressable>
            </View>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={pm.searchPlaceholder}
              placeholderTextColor={colors.text.tertiary}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={pm.searchPlaceholder}
              returnKeyType="search"
              style={[styles.searchInput, { color: colors.text.primary, borderColor: colors.border.default, backgroundColor: colors.surface.input }]}
            />
            <ScrollView contentContainerStyle={styles.outlineList} keyboardShouldPersistTaps="handled">
              {searchQuery.trim() && searchMatches.length === 0 ? (
                <View style={styles.searchEmpty}>
                  <Icon source="text-search" size={24} color={colors.text.tertiary} />
                  <Text style={[styles.searchEmptyText, { color: colors.text.tertiary }]}>{pm.searchNoResults}</Text>
                </View>
              ) : null}
              {searchMatches.map((match, index) => (
                <Pressable
                  key={match.id}
                  style={({ pressed }) => [
                    styles.searchResultRow,
                    { backgroundColor: pressed ? colors.surface.hover : colors.surface.panel },
                  ]}
                  onPress={() => {
                    if (canFocusStructuredMarkdownRange(markdownRef.current, match.range)) {
                      requestStructuredFocus(match.range);
                      setMode('edit');
                    } else {
                      requestSourceRange(match.range.start, match.range.end);
                    }
                    setSearchVisible(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={match.snippet}
                >
                  <Text style={[styles.outlineLevel, { color: colors.text.tertiary }]}>{index + 1}</Text>
                  <View style={styles.searchResultTextWrap}>
                    <Text style={[styles.searchResultQuery, { color: colors.accent.primary }]} numberOfLines={1}>
                      {match.query}
                    </Text>
                    <Text style={[styles.searchResultSnippet, { color: colors.text.secondary }]} numberOfLines={2}>
                      {match.snippet}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Snackbar
        visible={Boolean(snackMsg)}
        duration={TOAST_DURATION_SHORT}
        onDismiss={() => setSnackMsg('')}
        action={undoSnapshot ? { label: pm.editorUndo, onPress: undoAiSuggestion } : undefined}
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
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  editorWrap: {
    flex: 1,
  },
  titleWrap: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  titleInput: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    paddingVertical: 6,
  },
  titleText: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    paddingVertical: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 8,
  },
  detailChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  detailChipText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  modeLabel: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  statusDot: {
    fontSize: 12,
    lineHeight: 17,
  },
  readContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 120,
  },
  emptyRead: {
    minHeight: 220,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 20,
  },
  floatingActionDock: {
    position: 'absolute',
    alignSelf: 'center',
    minHeight: 52,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 26,
    paddingHorizontal: 4,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  floatingActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiInput: {
    minHeight: 100,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    lineHeight: 22,
  },
  aiComposeWrap: {
    gap: 10,
  },
  aiScopeRow: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  aiScopePill: {
    maxWidth: '72%',
    minHeight: 32,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiScopePillText: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  aiQuickActionRow: {
    gap: 8,
    paddingRight: 2,
  },
  aiQuickAction: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiQuickActionText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  searchInput: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 16,
    lineHeight: 22,
  },
  wikiLinkInsertButton: {
    alignSelf: 'flex-start',
  },
  aiSheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  aiSheetBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  aiSheet: {
    maxHeight: '86%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingTop: 10,
    gap: 12,
  },
  outlineSheet: {
    maxHeight: '72%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingTop: 10,
    gap: 12,
  },
  moreSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingTop: 10,
    gap: 12,
  },
  aiSheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 999,
    alignSelf: 'center',
    opacity: 0.55,
  },
  aiSheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  aiSheetTitleWrap: {
    flex: 1,
    gap: 2,
  },
  aiSheetTitle: {
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '700',
  },
  aiSheetSubtitle: {
    fontSize: 12,
    lineHeight: 17,
  },
  aiSheetClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiSheetActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    paddingTop: 2,
  },
  aiPreviewScroll: {
    maxHeight: 460,
  },
  aiPreviewContent: {
    gap: 10,
  },
  aiPreviewSummary: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  aiPreviewMeta: {
    fontSize: 12,
    lineHeight: 17,
  },
  aiPreviewSectionHeader: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  aiPreviewBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  aiPreviewLabel: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  aiPreviewText: {
    fontSize: 13,
    lineHeight: 19,
  },
  aiContextPreview: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  outlineList: {
    gap: 4,
    paddingBottom: 8,
  },
  outlineRow: {
    minHeight: 44,
    borderRadius: 10,
    paddingRight: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  outlineLevel: {
    width: 24,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  outlineTitle: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  moreActionList: {
    gap: 4,
    paddingBottom: 4,
  },
  moreActionRow: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  moreActionText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
  },
  searchResultRow: {
    minHeight: 56,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  searchResultTextWrap: {
    flex: 1,
    gap: 2,
  },
  searchResultQuery: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  searchResultSnippet: {
    fontSize: 13,
    lineHeight: 19,
  },
  searchEmpty: {
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  searchEmptyText: {
    fontSize: 13,
    lineHeight: 19,
  },
  linkSectionTitle: {
    paddingTop: 8,
    paddingHorizontal: 4,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  linkEmptyText: {
    paddingHorizontal: 4,
    paddingVertical: 8,
    fontSize: 13,
    lineHeight: 19,
  },
  linkLoading: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
