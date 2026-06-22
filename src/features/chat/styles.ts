/** Shared style constants for chat components. */
import { StyleSheet } from 'react-native';

export const chatColors = {
  userBubbleBg: 'rgba(58,107,255,0.10)',
  userBubbleBgDark: 'rgba(58,107,255,0.18)',
  assistantBg: '#FAFAFA',
  assistantBgDark: '#121212',
  thinkingBg: '#F4F6FF',
  thinkingBgDark: 'rgba(255,255,255,0.06)',
  thinkingBorder: '#ECECEC',
  thinkingBorderDark: 'rgba(255,255,255,0.1)',
  toolRunning: '#3A6BFF',
  toolDone: '#2CCB7F',
  toolError: '#FF5D5D',
  toolBg: '#FAFAFA',
  toolBgDark: 'rgba(255,255,255,0.04)',
  timestamp: '#999999',
  roleLabelUser: '#3A6BFF',
  roleLabelAssistant: '#666666',
  accent: '#3A6BFF',
  accentSoft: 'rgba(58,107,255,0.08)',
  accentSoftDark: 'rgba(58,107,255,0.15)',
  cursorBlink: '#3A6BFF',
  stepsBg: '#FAFAFA',
  stepsBgDark: 'rgba(255,255,255,0.04)',
  stepsBorder: '#ECECEC',
  stepsBorderDark: 'rgba(255,255,255,0.1)',
  stepsTimeline: '#ECECEC',
  stepsTimelineDark: 'rgba(255,255,255,0.12)',
} as const;

export const chatLayout = StyleSheet.create({
  messageBubbleRow: {
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  userBubbleContainer: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
  },
  assistantBubbleContainer: {
    alignSelf: 'flex-start',
    width: '92%',
    maxWidth: '92%',
  },
  userBubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  assistantBubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
