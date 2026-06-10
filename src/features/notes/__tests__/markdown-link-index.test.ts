import { describe, expect, it } from 'vitest';

import { backlinksForTitle, buildMarkdownLinkIndex, normalizeWikiTitle } from '../markdown/markdown-link-index';

describe('markdown-link-index', () => {
  it('normalizes wiki titles for backlink matching', () => {
    expect(normalizeWikiTitle('  Project   Alpha ')).toBe('project alpha');
  });

  it('indexes outgoing links and backlinks by target title', () => {
    const index = buildMarkdownLinkIndex([
      { id: 'a', title: 'Source A', markdown: 'See [[Project Alpha|Alpha]] and [[Project Beta#Plan]].' },
      { id: 'b', title: 'Source B', markdown: 'Related to [[ project alpha ]]' },
      { id: 'c', title: 'Empty', markdown: 'No links' },
    ]);

    expect(index.outgoingByNoteId.a.map((link) => ({ target: link.target, label: link.label, sourceTitle: link.sourceTitle }))).toEqual([
      { target: 'Project Alpha', label: 'Alpha', sourceTitle: 'Source A' },
      { target: 'Project Beta', label: 'Plan', sourceTitle: 'Source A' },
    ]);
    expect(backlinksForTitle(index, 'Project Alpha').map((link) => link.sourceNoteId)).toEqual(['a', 'b']);
    expect(backlinksForTitle(index, 'Project Beta').map((link) => link.heading)).toEqual(['Plan']);
  });
});
