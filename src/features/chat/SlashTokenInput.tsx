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

/** Regex to match `/skill:name` tokens (name is non-whitespace). */
const SLASH_TOKEN_RE = /\/skill:\S+/g;

export interface SlashTokenSegment {
  text: string;
  isPill: boolean;
  start: number;
  end: number;
}

/** Parse the draft into segments: plain text and pill tokens. */
export function parseSlashTokens(text: string): SlashTokenSegment[] {
  const segments: SlashTokenSegment[] = [];
  let lastIndex = 0;

  const regex = new RegExp(SLASH_TOKEN_RE.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Plain text before this token
    if (match.index > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, match.index),
        isPill: false,
        start: lastIndex,
        end: match.index,
      });
    }
    // The pill token itself
    segments.push({
      text: match[0],
      isPill: true,
      start: match.index,
      end: match.index + match[0].length,
    });
    lastIndex = match.index + match[0].length;
  }

  // Remaining plain text
  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      isPill: false,
      start: lastIndex,
      end: text.length,
    });
  }

  return segments;
}

/**
 * Given a cursor position, check if it's immediately after a pill token.
 * Returns the token range to delete, or null.
 */
export function findPillTokenEndingAtCursor(
  text: string,
  cursor: number,
): { start: number; end: number } | null {
  const regex = new RegExp(SLASH_TOKEN_RE.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const tokenEnd = match.index + match[0].length;
    if (tokenEnd === cursor) {
      return { start: match.index, end: tokenEnd };
    }
  }
  return null;
}

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

  const pillBg = isDark ? 'rgba(0,122,255,0.2)' : 'rgba(0,122,255,0.1)';
  const pillColor = isDark ? '#60A5FA' : '#2563EB';

  const handleKeyPress = useCallback(
    (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (e.nativeEvent.key === 'Backspace') {
        const tokenRange = findPillTokenEndingAtCursor(value, cursorPos);
        if (tokenRange) {
          // Delete the entire pill token
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
  return (
    <TextInput
      ref={inputRef}
      style={style}
      value={value}
      onChangeText={handleChangeText}
      onSelectionChange={handleSelectionChange}
      onKeyPress={handleKeyPress}
      {...rest}
    >
      {hasPills ? (
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
