import { memo, useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { useMessages } from '../../i18n/messages';
import { useTheme } from '../../theme';
import { getTagColors } from './note-tag-utils';

type NoteTagPickerSheetBaseProps = {
  visible: boolean;
  tags: readonly string[];
  onCreateTag: (tag: string) => string | null;
  onDismiss: () => void;
  focusCreate?: boolean;
};

type NoteTagPickerSheetSingleProps = NoteTagPickerSheetBaseProps & {
  mode?: 'single';
  selectedTag: string | null;
  onSelect: (tag: string | null) => void;
};

type NoteTagPickerSheetMultiProps = NoteTagPickerSheetBaseProps & {
  mode: 'multi';
  selectedTags: string[];
  onApplyTags: (tags: string[]) => void;
};

export type NoteTagPickerSheetProps = NoteTagPickerSheetSingleProps | NoteTagPickerSheetMultiProps;

export const NoteTagPickerSheet = memo(function NoteTagPickerSheet(props: NoteTagPickerSheetProps) {
  const {
    visible,
    tags,
    onCreateTag,
    onDismiss,
    focusCreate = false,
  } = props;
  const isMulti = props.mode === 'multi';
  const selectedTagsForMulti = isMulti ? props.selectedTags : [];
  const { colors } = useTheme();
  const pm = useMessages().notesPage;
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [draftTags, setDraftTags] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) {
      setDraft('');
      setError('');
      return;
    }
    if (isMulti) {
      setDraftTags(selectedTagsForMulti);
    }
  }, [isMulti, selectedTagsForMulti, visible]);

  const handleSelectSingle = useCallback(
    (tag: string | null) => {
      if (props.mode === 'multi') return;
      props.onSelect(tag);
      onDismiss();
    },
    [onDismiss, props],
  );

  const toggleDraftTag = useCallback((tag: string) => {
    setDraftTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
    );
  }, []);

  const handleCreate = useCallback(() => {
    const created = onCreateTag(draft);
    if (!created) {
      setError(pm.tagInvalid);
      return;
    }
    setDraft('');
    setError('');
    if (isMulti) {
      setDraftTags((current) => (current.includes(created) ? current : [...current, created]));
      return;
    }
    handleSelectSingle(created);
  }, [draft, handleSelectSingle, isMulti, onCreateTag, pm.tagInvalid]);

  const handleApplyMulti = useCallback(() => {
    if (props.mode !== 'multi') return;
    props.onApplyTags(draftTags);
    onDismiss();
  }, [draftTags, onDismiss, props]);

  const selectedTag = props.mode === 'multi' ? null : props.selectedTag;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.overlay} onPress={onDismiss}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface.panel }]}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <Text style={[styles.title, { color: colors.text.primary }]}>
                  {isMulti ? pm.tagPickerTitleMulti : pm.tagPickerTitle}
                </Text>
                {isMulti ? (
                  <Text style={[styles.subtitle, { color: colors.text.tertiary }]}>
                    {pm.tagMultiHint}
                  </Text>
                ) : null}
              </View>
              {isMulti ? (
                <Pressable onPress={() => setDraftTags([])} hitSlop={8}>
                  <Text style={[styles.clearAll, { color: colors.accent.primary }]}>{pm.tagClearAll}</Text>
                </Pressable>
              ) : null}
            </View>

            <ScrollView style={styles.scrollArea} bounces={false} keyboardShouldPersistTaps="handled">
              {!isMulti ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.row,
                    !selectedTag && { backgroundColor: colors.accent.selectionBg },
                    pressed && { opacity: 0.75 },
                  ]}
                  onPress={() => handleSelectSingle(null)}
                >
                  <View style={[styles.chip, { backgroundColor: '#FDE68A' }]}>
                    <Text style={[styles.chipText, { color: '#92400E' }]}>{pm.defaultTag}</Text>
                  </View>
                  <Text style={[styles.rowLabel, { color: colors.text.secondary }]}>{pm.tagUntaggedHint}</Text>
                  {!selectedTag ? <Icon source="check" size={18} color={colors.accent.primary} /> : null}
                </Pressable>
              ) : null}

              {tags.map((tag) => {
                const palette = getTagColors(tag, tags);
                const isActive = isMulti ? draftTags.includes(tag) : selectedTag === tag;
                return (
                  <Pressable
                    key={tag}
                    style={({ pressed }) => [
                      styles.row,
                      isActive && { backgroundColor: colors.accent.selectionBg },
                      pressed && { opacity: 0.75 },
                    ]}
                    onPress={() => (isMulti ? toggleDraftTag(tag) : handleSelectSingle(tag))}
                  >
                    <View style={[styles.chip, { backgroundColor: palette.bg }]}>
                      <Text style={[styles.chipText, { color: palette.fg }]}>{tag}</Text>
                    </View>
                    {isActive ? <Icon source="check" size={18} color={colors.accent.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={[styles.createBlock, { borderTopColor: colors.border.subtle }]}>
              <Text style={[styles.createLabel, { color: colors.text.secondary }]}>{pm.tagCreateLabel}</Text>
              <View style={styles.createRow}>
                <TextInput
                  value={draft}
                  onChangeText={(value) => {
                    setDraft(value);
                    if (error) setError('');
                  }}
                  placeholder={pm.tagCreatePlaceholder}
                  placeholderTextColor={colors.text.tertiary}
                  style={[
                    styles.input,
                    {
                      color: colors.text.primary,
                      backgroundColor: colors.surface.input,
                      borderColor: error ? colors.semantic.error : colors.border.default,
                    },
                  ]}
                  autoFocus={focusCreate}
                  returnKeyType="done"
                  onSubmitEditing={handleCreate}
                  maxLength={24}
                />
                <Pressable
                  style={[
                    styles.createBtn,
                    {
                      backgroundColor: draft.trim() ? colors.text.primary : colors.surface.input,
                    },
                  ]}
                  onPress={handleCreate}
                  disabled={!draft.trim()}
                >
                  <Text
                    style={{
                      color: draft.trim() ? colors.text.inverse : colors.text.tertiary,
                      fontWeight: '600',
                      fontSize: 14,
                    }}
                  >
                    {pm.tagCreateAction}
                  </Text>
                </Pressable>
              </View>
              {error ? (
                <Text style={[styles.errorText, { color: colors.semantic.error }]}>{error}</Text>
              ) : null}
              {isMulti ? (
                <Pressable
                  style={[styles.doneBtn, { backgroundColor: colors.text.primary }]}
                  onPress={handleApplyMulti}
                >
                  <Text style={[styles.doneBtnText, { color: colors.text.inverse }]}>{pm.tagDone}</Text>
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingBottom: 24,
    maxHeight: '72%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.35)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 8,
    gap: 12,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
  },
  clearAll: {
    fontSize: 13,
    fontWeight: '600',
    paddingTop: 2,
  },
  scrollArea: {
    paddingHorizontal: 12,
    maxHeight: 280,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 2,
  },
  rowLabel: {
    flex: 1,
    fontSize: 13,
  },
  chip: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  createBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 14,
    gap: 8,
  },
  createLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 10, default: 8 }),
    fontSize: 15,
  },
  createBtn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  doneBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  doneBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  errorText: {
    fontSize: 12,
  },
});
