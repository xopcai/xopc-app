/** Empty-chat shortcut chips shown above the composer (new session only). */

export type EmptyChatShortcutId = 'goal' | 'thinking' | 'plan' | 'skill';

export type EmptyChatShortcutAction = 'sheet' | 'sendTemplate';

export type EmptyChatShortcutDef = {
  id: EmptyChatShortcutId;
  icon: string;
  action: EmptyChatShortcutAction;
  /** i18n key under `chat.emptyShortcuts` for the chip label */
  labelKey: 'goal' | 'thinking' | 'plan' | 'skill';
  /** i18n key for one-shot template body when action is sendTemplate */
  templateKey?: 'templateThinking' | 'templatePlan';
};

export const EMPTY_CHAT_SHORTCUTS: EmptyChatShortcutDef[] = [
  { id: 'goal', icon: 'flag-outline', action: 'sheet', labelKey: 'goal' },
  {
    id: 'thinking',
    icon: 'head-lightbulb-outline',
    action: 'sendTemplate',
    labelKey: 'thinking',
    templateKey: 'templateThinking',
  },
  {
    id: 'plan',
    icon: 'format-list-checks',
    action: 'sendTemplate',
    labelKey: 'plan',
    templateKey: 'templatePlan',
  },
  { id: 'skill', icon: 'puzzle-outline', action: 'sheet', labelKey: 'skill' },
];
