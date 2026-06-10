import type { NoteAiPatch, NoteBlock, NoteBlockType, NoteTextMarkType } from '../../../../query/notes';

export type BlockCommand =
  | { type: 'updateText'; blockId: string; text: string }
  | { type: 'toggleTextMark'; blockId: string; markType: NoteTextMarkType; from: number; to: number; href?: string }
  | { type: 'updateChecked'; blockId: string; checked: boolean }
  | { type: 'insertAfter'; afterBlockId: string; block: NoteBlock }
  | { type: 'insertImageAfter'; afterBlockId: string; attachmentId: string; alt?: string }
  | { type: 'appendLink'; blockId: string; url: string }
  | { type: 'delete'; blockId: string }
  | { type: 'duplicate'; blockId: string }
  | { type: 'splitText'; blockId: string; offset: number }
  | { type: 'mergeWithPrevious'; blockId: string }
  | { type: 'convert'; blockId: string; toType: NoteBlockType }
  | { type: 'indent'; blockId: string }
  | { type: 'outdent'; blockId: string }
  | { type: 'move'; blockId: string; afterBlockId: string | null }
  | { type: 'applyPatch'; patch: NoteAiPatch };

export interface BlockTransaction {
  commands: BlockCommand[];
}

export function transaction(...commands: BlockCommand[]): BlockTransaction {
  return { commands };
}
