import { Extension } from '@tiptap/core';
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion';

import { createSlashItems, filterSlashItems, type SlashItem } from './slash-items';

export type SlashCommandHandlers = {
  onStart: (props: SuggestionProps<SlashItem>) => void;
  onUpdate: (props: SuggestionProps<SlashItem>) => void;
  onExit: () => void;
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

export function createSlashCommandExtension(handlers: SlashCommandHandlers) {
  const items = createSlashItems();

  return Extension.create({
    name: 'slashCommand',

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          char: '/',
          allowSpaces: false,
          startOfLine: true,
          items: ({ query }) => filterSlashItems(items, query),
          command: ({ editor, range, props }) => {
            editor.chain().focus().deleteRange(range).run();
            props.run(editor);
          },
          render: () => ({
            onStart: handlers.onStart,
            onUpdate: handlers.onUpdate,
            onExit: handlers.onExit,
            onKeyDown: handlers.onKeyDown,
          }),
        }),
      ];
    },
  });
}
