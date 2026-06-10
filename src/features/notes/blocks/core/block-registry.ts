import type { NoteBlockType } from '../../../../query/notes';

import { createBlockForType } from './block-reducer';

export interface BlockTypeMeta {
  isText: boolean;
  allowChildren: boolean;
  draggable: boolean;
}

export interface BlockTypeDefinition {
  type: NoteBlockType;
  meta: BlockTypeMeta;
  create: () => ReturnType<typeof createBlockForType>;
}

const REGISTRY = new Map<NoteBlockType, BlockTypeDefinition>();

function register(definition: BlockTypeDefinition): void {
  REGISTRY.set(definition.type, definition);
}

register({
  type: 'paragraph',
  meta: { isText: true, allowChildren: false, draggable: true },
  create: () => createBlockForType('paragraph'),
});

register({
  type: 'heading',
  meta: { isText: true, allowChildren: false, draggable: true },
  create: () => createBlockForType('heading'),
});

register({
  type: 'todo',
  meta: { isText: true, allowChildren: false, draggable: true },
  create: () => createBlockForType('todo'),
});

register({
  type: 'bulletList',
  meta: { isText: true, allowChildren: true, draggable: true },
  create: () => createBlockForType('bulletList'),
});

register({
  type: 'numberedList',
  meta: { isText: true, allowChildren: true, draggable: true },
  create: () => createBlockForType('numberedList'),
});

register({
  type: 'quote',
  meta: { isText: true, allowChildren: false, draggable: true },
  create: () => createBlockForType('quote'),
});

register({
  type: 'callout',
  meta: { isText: true, allowChildren: false, draggable: true },
  create: () => createBlockForType('callout'),
});

register({
  type: 'toggle',
  meta: { isText: true, allowChildren: true, draggable: true },
  create: () => createBlockForType('toggle'),
});

register({
  type: 'code',
  meta: { isText: true, allowChildren: false, draggable: true },
  create: () => createBlockForType('code'),
});

register({
  type: 'divider',
  meta: { isText: false, allowChildren: false, draggable: true },
  create: () => createBlockForType('divider'),
});

register({
  type: 'image',
  meta: { isText: false, allowChildren: false, draggable: true },
  create: () => createBlockForType('paragraph'),
});

register({
  type: 'aiSuggestion',
  meta: { isText: true, allowChildren: false, draggable: true },
  create: () => createBlockForType('paragraph'),
});

export function getBlockTypeDefinition(type: NoteBlockType): BlockTypeDefinition | undefined {
  return REGISTRY.get(type);
}

export function isTextBlockType(type: NoteBlockType): boolean {
  return REGISTRY.get(type)?.meta.isText ?? false;
}

export function isFocusableBlockType(type: NoteBlockType): boolean {
  return type !== 'divider' && type !== 'image';
}
