/**
 * SlashTokenInput — a TextInput that renders `/skill:name` tokens as styled pills.
 *
 * Uses RN's nested <Text> children inside TextInput to apply visual styling
 * while keeping the underlying value as plain text for gateway compatibility.
 *
 * Supports whole-token backspace deletion: when cursor is right after a pill token,
 * pressing backspace removes the entire token at once.
 */
import { forwardRef, memo, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput,
  type TextInputProps,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import { Text } from 'react-native-paper';

import {
  findPillTokenEndingAtCursor,
  parseSlashTokens,
} from './slash-token-utils';

export type { SlashTokenSegment } from './slash-token-utils';
export { findPillTokenEndingAtCursor, parseSlashTokens } from './slash-token-utils';

/** Android crashes when TextInput has both `value` and nested Text children. */
const SUPPORTS_PILL_CHILDREN = Platform.OS === 'ios';

interface SlashTokenInputProps extends Omit<TextInputProps, 'children'> {
  value: string;
  onChangeText: (text: string) => void;
  onCursorChange?: (pos: number) => void;
  cursorPos: number;
  isDark: boolean;
}

export const SlashTokenInput = memo(
  forwardRef<TextInput, SlashTokenInputProps>(function SlashTokenInput(
    {
      value,
      onChangeText,
      onCursorChange,
      cursorPos,
      isDark,
      style,
      ...rest
    },
    ref,
  ) {
  const inputRef = useRef<TextInput>(null);
  useImperativeHandle(ref, () => inputRef.current!, []);
  const suppressNextChangeRef = useRef(false);

  const segments = useMemo(() => parseSlashTokens(value), [value]);
  const hasPills = segments.some((s) => s.isPill);
  const renderPillChildren = hasPills && SUPPORTS_PILL_CHILDREN;

  const pillBg = isDark ? 'rgba(0,122,255,0.2)' : 'rgba(0,122,255,0.1)';
  const pillColor = isDark ? '#60A5FA' : '#2563EB';

  const handleKeyPress = useCallback(
    (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (e.nativeEvent.key === 'Backspace') {
        const tokenRange = findPillTokenEndingAtCursor(value, cursorPos);
        if (tokenRange) {
          const newText =
            value.slice(0, tokenRange.start) + value.slice(tokenRange.end);
          suppressNextChangeRef.current = true;
          onChangeText(newText);
          onCursorChange?.(tokenRange.start);
        }
      }
    },
    [value, cursorPos, onChangeText, onCursorChange],
  );

  const handleChangeText = useCallback(
    (text: string) => {
      if (suppressNextChangeRef.current) {
        suppressNextChangeRef.current = false;
        return;
      }
      onChangeText(text);
    },
    [onChangeText],
  );

  const handleSelectionChange = useCallback(
    (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      onCursorChange?.(e.nativeEvent.selection.end);
    },
    [onCursorChange],
  );

  // Keep a single TextInput instance so focus survives pill token insert/remove.
  // iOS only: omit `value` when rendering styled children (RN invariant on Android).
  return (
    <TextInput
      ref={inputRef}
      style={style}
      {...(renderPillChildren ? {} : { value })}
      onChangeText={handleChangeText}
      onSelectionChange={handleSelectionChange}
      onKeyPress={handleKeyPress}
      {...rest}
    >
      {renderPillChildren ? (
        <Text>
          {segments.map((seg, i) =>
            seg.isPill ? (
              <Text
                key={i}
                style={[
                  pillStyles.pill,
                  { backgroundColor: pillBg, color: pillColor },
                ]}
              >
                {seg.text}
              </Text>
            ) : (
              <Text key={i}>{seg.text}</Text>
            ),
          )}
        </Text>
      ) : null}
    </TextInput>
  );
  }),
);

const pillStyles = StyleSheet.create({
  pill: {
    fontSize: 14,
    fontWeight: '600',
    borderRadius: 4,
    paddingHorizontal: Platform.OS === 'ios' ? 2 : 1,
    overflow: 'hidden',
  },
});
