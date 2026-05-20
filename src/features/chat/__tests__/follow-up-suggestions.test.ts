import { describe, expect, it } from 'vitest';

import {
  buildFollowUpContextPack,
  followUpPromptForSuggestionId,
  suggestFollowUps,
  suggestFollowUpsFromAssistantMessage,
  FOLLOW_UP_SUGGESTION_IDS,
} from '../follow-up-suggestions';
import type { Message } from '../messages.types';

function suggestForTurn(userText: string, assistantText: string, locale: 'en' | 'zh' = 'zh') {
  const user: Message = {
    role: 'user',
    content: [{ type: 'text', text: userText }],
    timestamp: 1,
  };
  const assistant: Message = {
    role: 'assistant',
    content: [{ type: 'text', text: assistantText }],
    timestamp: 2,
  };
  const messages = [user, assistant];
  const ctx = buildFollowUpContextPack({ messages, appendedAssistant: assistant, locale });
  return ctx ? suggestFollowUps(ctx) : [];
}

describe('suggestFollowUpsFromAssistantMessage', () => {
  it('returns empty for plain overview without user context', () => {
    const msg: Message = {
      role: 'assistant',
      content: [{ type: 'text', text: 'Here is an overview of the topic with enough length to matter.' }],
      timestamp: 1,
    };
    expect(suggestFollowUpsFromAssistantMessage(msg)).toEqual([]);
  });

  it('biases toward code-oriented ids when code-like', () => {
    const msg: Message = {
      role: 'assistant',
      content: [{ type: 'text', text: 'Use `export function foo()` in your module.' }],
      timestamp: 1,
    };
    const s = suggestFollowUpsFromAssistantMessage(msg);
    expect(s).toContain('code_error_handling');
    expect(s).not.toContain('what_next');
  });

  it('includes web chips when URLs or references appear alongside code', () => {
    const msg: Message = {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text:
            'See https://example.com/doc for the API. ```ts\nexport async function fetch() {}\n```',
        },
      ],
      timestamp: 1,
    };
    const s = suggestFollowUpsFromAssistantMessage(msg);
    expect(s.some((id) => id.startsWith('code_'))).toBe(true);
    expect(s).toContain('web_more_details');
  });

  it('includes email chips for common letter patterns', () => {
    const msg: Message = {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text:
            'Dear team,\n\nHere is the update.\n\nBest regards,\nAlex\n\n' +
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor.',
        },
      ],
      timestamp: 1,
    };
    const s = suggestFollowUpsFromAssistantMessage(msg);
    expect(s.some((id) => id === 'email_make_formal' || id === 'email_shorten')).toBe(true);
  });

  it('returns empty for non-assistant', () => {
    const msg: Message = {
      role: 'user',
      content: [{ type: 'text', text: 'Hi' }],
      timestamp: 1,
    };
    expect(suggestFollowUpsFromAssistantMessage(msg)).toEqual([]);
  });
});

describe('suggestFollowUps with context pack', () => {
  it('prefers code_fix_error when user reports an error', () => {
    const s = suggestForTurn(
      'export function foo() throws TypeError at runtime',
      'TypeError: Cannot read properties of undefined\n    at foo (app.ts:12:3)',
      'en',
    );
    expect(s).toContain('code_fix_error');
    expect(s[0]).toBe('code_fix_error');
    expect(s).not.toContain('what_next');
  });

  it('down-ranks bullet summary when assistant already listed bullets', () => {
    const assistant: Message = {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: '- First point\n- Second point\n- Third point\n- Fourth point with enough text.',
        },
      ],
      timestamp: 1,
    };
    const ctx = buildFollowUpContextPack({ messages: [assistant], appendedAssistant: assistant });
    const s = suggestFollowUps(ctx!);
    expect(s).not.toContain('generic_bullet_points');
  });

  it('returns empty when clarify is active', () => {
    const assistant: Message = {
      role: 'assistant',
      content: [{ type: 'text', text: 'Some answer with enough length to be substantial for scoring.' }],
      timestamp: 1,
    };
    const ctx = buildFollowUpContextPack({
      messages: [assistant],
      appendedAssistant: assistant,
      clarifyActive: true,
    });
    expect(suggestFollowUps(ctx!)).toEqual([]);
  });

  it('omits web chips when capWebSearch is false', () => {
    const assistant: Message = {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'See https://example.com for docs. ```ts\nexport async function run() {}\n```',
        },
      ],
      timestamp: 1,
    };
    const ctx = buildFollowUpContextPack({
      messages: [assistant],
      appendedAssistant: assistant,
      capabilities: { capWebSearch: false, capWebFetch: false, capShell: true, capBrowser: true, capCron: true },
    });
    const s = suggestFollowUps(ctx!);
    expect(s.some((id) => id.startsWith('web_'))).toBe(false);
    expect(s).not.toContain('research_deeper');
  });

  it('suggests learn chips for RAG explainer with diagram fence, not code chips', () => {
    const ragExplain =
      '当然！让我用最通俗的方式给你讲讲 RAG 是怎么回事。\n\n' +
      'RAG（检索增强生成）就像是开卷考试的学生。\n\n' +
      '第一步：建索引\n第二步：检索\n第三步：生成\n\n' +
      '为什么需要 RAG？\n\n| 问题 | RAG 怎么解决 |\n| --- | --- |\n| 知识过时 | 查最新文档 |\n\n' +
      '```\n复制\n你提问 ⟶ 在知识库里搜索 ⟶ 大模型回答\n```\n\n' +
      '简单来说：RAG = 搜索 + 问答。\n\n' +
      '有什么想深入了解的吗？比如具体的技术实现，或者想看看怎么搭建一个？';
    const s = suggestForTurn('用通俗的方式讲讲 RAG 是怎么回事', ragExplain);
    expect(s).not.toContain('code_error_handling');
    expect(s).not.toContain('code_explain');
    expect(s).not.toContain('generic_action_checklist');
    expect(s.some((id) => id.startsWith('learn_'))).toBe(true);
    expect(s).not.toContain('what_next');
  });

  it('suggests ops_channel_next for gateway setup questions', () => {
    const s = suggestForTurn(
      'How do I configure telegram channel in gateway?',
      'Enable channels.telegram in xopc.json and set botToken...',
      'en',
    );
    expect(s.some((id) => id === 'ops_channel_next' || id === 'ops_fix_config')).toBe(true);
  });
});

describe('Phase A conservative relevance', () => {
  it('shows no chips for weather small talk', () => {
    expect(
      suggestForTurn(
        '今天北京天气怎么样？',
        '今天北京晴，气温 15-22°C，适合户外活动。早晚温差较大，建议带一件薄外套。',
      ),
    ).toEqual([]);
  });

  it('shows no chips for translation tasks', () => {
    expect(
      suggestForTurn(
        '把下面这段话翻译成英文：我们公司将于下周发布新产品。',
        'Our company will launch a new product next week.',
      ),
    ).toEqual([]);
  });

  it('shows no chips for brief acknowledgements', () => {
    expect(suggestForTurn('好的，就按你说的做', '好的，有需要随时叫我。')).toEqual([]);
  });

  it('shows no chips when English "type of" would false-trigger code', () => {
    expect(
      suggestForTurn(
        'What type of exercise is best for beginners?',
        'For beginners, low-impact cardio is ideal. You may also want bodyweight exercises.',
        'en',
      ),
    ).toEqual([]);
  });

  it('shows no chips for travel or recipe questions', () => {
    expect(
      suggestForTurn(
        '推荐一下京都三日游路线',
        'Day 1: 伏见稻荷、清水寺。Day 2: 岚山、金阁寺。Day 3: 锦市场、祇园。建议购买巴士一日券。',
      ),
    ).toEqual([]);
    expect(
      suggestForTurn(
        '如何做番茄炒蛋',
        '先打蛋加盐，番茄切块。热锅倒油，先炒蛋盛出，再炒番茄，最后混合翻炒即可。',
      ),
    ).toEqual([]);
  });

  it('does not suggest ops chips for generic API gateway discussion', () => {
    const s = suggestForTurn(
      'API gateway 和 service mesh 有什么区别？',
      'API gateway 通常处理南北向流量；service mesh 处理东西向服务间通信。两者可以配合使用。',
    );
    expect(s.some((id) => id.startsWith('ops_'))).toBe(false);
  });

  it('suggests compare workflow chip for A-vs-B product choice', () => {
    const s = suggestForTurn(
      '我们在考虑用 Postgres 还是 MongoDB 存用户数据',
      'Postgres 适合强一致性；MongoDB 更灵活。你们团队对 SQL 更熟的话 Postgres 上手更快。',
    );
    expect(s).toContain('wf_compare_options');
    expect(s).not.toContain('research_deeper');
  });

  it('down-ranks recently picked chip ids', () => {
    const user: Message = {
      role: 'user',
      content: [{ type: 'text', text: 'export function foo() throws TypeError at runtime' }],
      timestamp: 1,
    };
    const assistant: Message = {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'TypeError: Cannot read properties of undefined\n    at foo (app.ts:12:3)\n```ts\nexport function foo() {}\n```',
        },
      ],
      timestamp: 2,
    };
    const ctx = buildFollowUpContextPack({ messages: [user, assistant], appendedAssistant: assistant, locale: 'en' });
    const first = suggestFollowUps(ctx!);
    expect(first[0]).toBe('code_fix_error');
    const second = suggestFollowUps(ctx!, { recentPickedIds: ['code_fix_error'] });
    expect(second[0]).not.toBe('code_fix_error');
  });
});

describe('followUpPromptForSuggestionId', () => {
  it('returns English prompts for every suggestion id', () => {
    for (const id of FOLLOW_UP_SUGGESTION_IDS) {
      const p = followUpPromptForSuggestionId(id, 'en');
      expect(p.length).toBeGreaterThan(10);
      expect(p).toMatch(/[a-z]/i);
    }
  });

  it('returns Chinese prompts when locale is zh', () => {
    const p = followUpPromptForSuggestionId('what_next', 'zh');
    expect(p).toMatch(/[\u4e00-\u9fff]/);
  });
});
