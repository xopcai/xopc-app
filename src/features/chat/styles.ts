/** Shared style constants for chat components. */
import { StyleSheet } from 'react-native';

export const chatColors = {
  userBubbleBg: '#DBEAFE', // blue-100
  userBubbleBgDark: 'rgba(59,130,246,0.18)',
  assistantBg: '#FFFFFF',
  assistantBgDark: '#1C1C1E',
  thinkingBg: '#F3F4F6', // gray-100
  thinkingBgDark: 'rgba(255,255,255,0.06)',
  thinkingBorder: '#E5E7EB',
  thinkingBorderDark: 'rgba(255,255,255,0.1)',
  toolRunning: '#3B82F6', // blue-500
  toolDone: '#22C55E', // green-500
  toolError: '#EF4444', // red-500
  toolBg: '#F9FAFB',
  toolBgDark: 'rgba(255,255,255,0.04)',
  timestamp: '#9CA3AF', // gray-400
  roleLabelUser: '#2563EB',
  roleLabelAssistant: '#6B7280',
  accent: '#2563EB',
  accentSoft: 'rgba(37,99,235,0.08)',
  accentSoftDark: 'rgba(59,130,246,0.15)',
  cursorBlink: '#3B82F6',
  stepsBg: '#F9FAFB',
  stepsBgDark: 'rgba(255,255,255,0.04)',
  stepsBorder: '#E5E7EB',
  stepsBorderDark: 'rgba(255,255,255,0.1)',
  stepsTimeline: '#E5E7EB',
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
