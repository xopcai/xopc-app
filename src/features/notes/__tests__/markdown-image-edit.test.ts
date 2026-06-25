import { describe, expect, it } from 'vitest';

import {
  deleteMarkdownImage,
  findMarkdownImageAtSelection,
  insertMarkdownImageBlock,
  replaceMarkdownImage,
  updateMarkdownImageCaption,
} from '../markdown/markdown-image-edit';

describe('markdown-image-edit', () => {
  it('detects an image on the current line', () => {
    expect(findMarkdownImageAtSelection('Intro\n![Alt](xopc-attachment://notes/n/a)\nEnd', { start: 10, end: 10 })).toEqual({
      range: { start: 6, end: 41 },
      alt: 'Alt',
      src: 'xopc-attachment://notes/n/a',
    });
  });

  it('updates caption and replaces image src', () => {
    const source = '![Alt](src-a)';
    const image = findMarkdownImageAtSelection(source, { start: 2, end: 2 });
    expect(image).not.toBeNull();
    expect(updateMarkdownImageCaption(source, image!, 'New Alt').markdown).toBe('![New Alt](src-a)');
    expect(replaceMarkdownImage(source, image!, { alt: 'Photo', src: 'src-b' }).markdown).toBe('![Photo](src-b)');
  });

  it('deletes the whole image line', () => {
    const source = 'Intro\n![Alt](src)\nEnd';
    const image = findMarkdownImageAtSelection(source, { start: 8, end: 8 });
    expect(deleteMarkdownImage(source, image!).markdown).toBe('Intro\nEnd');
  });

  it('inserts an image block and moves the caret to the next line', () => {
    expect(insertMarkdownImageBlock('Intro', { start: 5, end: 5 }, { alt: 'Photo', src: 'src' })).toEqual({
      markdown: 'Intro\n![Photo](src)\n',
      selection: { start: 20, end: 20 },
    });
  });
});
