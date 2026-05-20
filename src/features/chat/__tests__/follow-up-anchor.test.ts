import { describe, expect, it } from 'vitest';

import {
  buildFollowUpAnchor,
  buildFollowUpDisplays,
  extractTopicHint,
  followUpChipLabel,
} from '../follow-up-anchor';
import { buildFollowUpContextPack } from '../follow-up-context';
import { followUpPromptForSuggestionId } from '../follow-up-prompts';
import type { Message } from '../messages.types';

describe('extractTopicHint', () => {
  it('extracts compare topics', () => {
    expect(extractTopicHint('我们在考虑用 Postgres 还是 MongoDB')).toMatch(/Postgres vs MongoDB/i);
  });

  it('extracts quoted topics', () => {
    expect(extractTopicHint('用通俗的方式讲讲「RAG」是怎么回事')).toBe('RAG');
  });

  it('strips question prefixes', () => {
    expect(extractTopicHint('如何配置 telegram channel')).toMatch(/telegram/i);
  });
});

describe('followUpChipLabel', () => {
  it('anchors research chip with topic', () => {
    const label = followUpChipLabel('research_deeper', 'zh', { topicHint: 'RAG', userSnippet: 'x', assistantSnippet: 'y' }, '深入检索');
    expect(label).toContain('RAG');
    expect(label).not.toBe('深入检索');
  });

  it('falls back to base label without topic', () => {
    expect(
      followUpChipLabel('research_deeper', 'en', { topicHint: '', userSnippet: 'q', assistantSnippet: 'a' }, 'Research further'),
    ).toBe('Research further');
  });
});

describe('followUpPromptForSuggestionId with anchor', () => {
  it('includes user question in prompt', () => {
    const anchor = buildFollowUpAnchor({
      locale: 'zh',
      clarifyActive: false,
      channel: 'webchat',
      userText: '用通俗的方式讲讲 RAG',
      userHasAttachments: false,
      assistantText: 'RAG 是检索增强生成……',
      assistantHasThinking: false,
      assistantToolUses: [],
      priorTurnCount: 1,
      recentUserTexts: [],
      recentAssistantSnippet: '',
      capabilities: {
        capWebSearch: true,
        capWebFetch: true,
        capShell: true,
        capBrowser: true,
        capCron: true,
      },
    });
    const p = followUpPromptForSuggestionId('learn_technical_detail', 'zh', anchor);
    expect(p).toContain('【我方问题】');
    expect(p).toContain('RAG');
  });

  it('customizes compare prompt with topic', () => {
    const user: Message = {
      role: 'user',
      content: [{ type: 'text', text: 'Postgres 还是 MongoDB' }],
      timestamp: 1,
    };
    const assistant: Message = {
      role: 'assistant',
      content: [{ type: 'text', text: '两者各有优劣……' }],
      timestamp: 2,
    };
    const ctx = buildFollowUpContextPack({ messages: [user, assistant], appendedAssistant: assistant, locale: 'zh' });
    const anchor = buildFollowUpAnchor(ctx!);
    const p = followUpPromptForSuggestionId('wf_compare_options', 'zh', anchor);
    expect(p).toMatch(/对比|表格/);
    expect(p).toMatch(/Postgres|MongoDB/i);
  });
});

describe('buildFollowUpDisplays', () => {
  it('returns anchored labels for ids', () => {
    const displays = buildFollowUpDisplays(
      ['wf_compare_options'],
      'zh',
      { topicHint: 'Postgres vs MongoDB', userSnippet: 'q', assistantSnippet: 'a' },
      () => '对比方案',
    );
    expect(displays[0]?.label).toContain('Postgres vs MongoDB');
  });
});
