import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../../theme';
import NoteWebEditor from '../web-editor/NoteWebEditor';
import type {
  EditorAiRequest,
  EditorAiResponse,
  EditorAiMetadata,
  EditorImagePickResult,
  EditorSelectionContext,
  EditorWikiLinkCandidate,
  NoteEditorLabels,
  NoteEditorTheme,
} from './editor-protocol';

export interface NoteEditorBridgeProps {
  noteId: string;
  markdown: string;
  attachmentSrcMap?: Record<string, string>;
  labels: NoteEditorLabels;
  onChangeMarkdown: (markdown: string) => void;
  onSelectionChange: (context: EditorSelectionContext) => void;
  onRequestImage: () => Promise<EditorImagePickResult>;
  onRequestAi: (request: EditorAiRequest) => Promise<EditorAiResponse | null>;
  onApplyAiMetadata: (metadata: EditorAiMetadata) => Promise<void>;
  onRequestWikiLink: (query: string) => Promise<EditorWikiLinkCandidate[]>;
}

export const NoteEditorBridge = memo(function NoteEditorBridge({
  noteId,
  markdown,
  attachmentSrcMap,
  labels,
  onChangeMarkdown,
  onSelectionChange,
  onRequestImage,
  onRequestAi,
  onApplyAiMetadata,
  onRequestWikiLink,
}: NoteEditorBridgeProps) {
  const { colors } = useTheme();
  const editorTheme = useMemo<NoteEditorTheme>(() => ({
    background: colors.surface.base,
    panel: colors.surface.panel,
    input: colors.surface.input,
    text: colors.text.primary,
    textSecondary: colors.text.secondary,
    textTertiary: colors.text.tertiary,
    border: colors.border.default,
    accent: colors.accent.primary,
    accentSoft: colors.accent.selectionBg,
    danger: colors.semantic.error,
  }), [colors]);

  const handleChange = useCallback(async (nextMarkdown: string) => {
    onChangeMarkdown(nextMarkdown);
  }, [onChangeMarkdown]);

  const handleSelectionChange = useCallback(async (context: EditorSelectionContext) => {
    onSelectionChange(context);
  }, [onSelectionChange]);

  return (
    <View style={styles.container}>
      <NoteWebEditor
        noteId={noteId}
        initialMarkdown={markdown}
        attachmentSrcMap={attachmentSrcMap}
        theme={editorTheme}
        labels={labels}
        onChangeMarkdown={handleChange}
        onSelectionChange={handleSelectionChange}
        onRequestImage={onRequestImage}
        onRequestAi={onRequestAi}
        onApplyAiMetadata={onApplyAiMetadata}
        onRequestWikiLink={onRequestWikiLink}
        dom={{
          scrollEnabled: false,
          containerStyle: styles.domContainer,
          style: styles.dom,
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
  domContainer: {
    flex: 1,
  },
  dom: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
