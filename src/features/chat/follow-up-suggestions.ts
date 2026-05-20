import type { FollowUpContextPack } from './follow-up-context';
export { followUpPromptForSuggestionId } from './follow-up-prompts';
export type { FollowUpPromptLocale } from './follow-up-prompts';
export {
  FOLLOW_UP_SUGGESTION_IDS,
  type FollowUpSuggestionId,
} from './follow-up-suggestions.types';

import {
  FOLLOW_UP_SUGGESTION_IDS,
  type FollowUpSuggestionId,
} from './follow-up-suggestions.types';
import type { Message } from './messages.types';
import { buildFollowUpContextPack } from './follow-up-context';

type FollowUpFamily = 'code' | 'web' | 'email' | 'date' | 'generic' | 'meta' | 'ops' | 'workflow' | 'learn';

/** Minimum score for a chip to be shown (conservative — omit weak matches). */
const MIN_CHIP_SCORE = 22;

/** `what_next` only appears alongside at least one domain chip above this bar. */
const MIN_WHAT_NEXT_SCORE = 14;

const ALL_IDS = FOLLOW_UP_SUGGESTION_IDS;

type UserIntent =
  | 'chitchat'
  | 'translation'
  | 'creative'
  | 'compare'
  | 'code'
  | 'ops'
  | 'email'
  | 'research'
  | 'unknown';

function familyOf(id: FollowUpSuggestionId): FollowUpFamily {
  if (id.startsWith('code_')) return 'code';
  if (id.startsWith('web_') || id === 'research_deeper') return 'web';
  if (id.startsWith('email_')) return 'email';
  if (id.startsWith('date_')) return 'date';
  if (id.startsWith('learn_')) return 'learn';
  if (id.startsWith('wf_')) return 'workflow';
  if (id.startsWith('ops_')) return 'ops';
  if (id === 'what_next') return 'meta';
  return 'generic';
}

const BASE_FAMILY_MAX: Record<FollowUpFamily, number> = {
  code: 2,
  web: 2,
  email: 1,
  date: 1,
  generic: 2,
  meta: 1,
  ops: 1,
  workflow: 1,
  learn: 2,
};

type ContentSignals = {
  code: boolean;
  web: boolean;
  email: boolean;
  date: boolean;
  list: boolean;
  table: boolean;
  substantial: boolean;
};

type DerivedSignals = ContentSignals & {
  taskDebug: boolean;
  taskImplement: boolean;
  taskReview: boolean;
  taskPlan: boolean;
  taskConfig: boolean;
  taskResearch: boolean;
  taskCompare: boolean;
  taskTest: boolean;
  taskGit: boolean;
  assistantAlreadyBullets: boolean;
  assistantAlreadyTable: boolean;
  assistantAlreadyShort: boolean;
  assistantOffersOptions: boolean;
  userLangZh: boolean;
  toolsUsedWebSearch: boolean;
  toolsUsedWrite: boolean;
  toolsUsedShell: boolean;
  toolsUsedBrowser: boolean;
  anyToolError: boolean;
  taskEducational: boolean;
  hasRealCode: boolean;
  userIntent: UserIntent;
  userWantsFormattedOutput: boolean;
};

const CODE_KEYWORD_RE =
  /\b(function|class|const |def |import |export |async |await |interface |public |private |protected |#include|namespace )\b/;

const CODE_KEYWORD_RE2 = /\b(return |if \(|for \(|while \(|\.map\(|\.filter\(|fn )\b/;

/** Fenced blocks or keywords that indicate actual source code — not diagram-only ``` fences. */
function detectHasRealCode(slice: string, lower: string): boolean {
  if (CODE_KEYWORD_RE.test(lower) || CODE_KEYWORD_RE2.test(lower)) return true;

  const fences = [...slice.matchAll(/```[\w-]*\n?([\s\S]*?)```/g)];
  for (const match of fences) {
    const inner = (match[1] ?? '').trim();
    if (inner.length < 4) continue;
    const innerLower = inner.toLowerCase();
    if (CODE_KEYWORD_RE.test(innerLower) || CODE_KEYWORD_RE2.test(innerLower)) return true;
    if (/[{};]/.test(inner) && /\n/.test(inner)) return true;
  }
  return false;
}

function detectEducational(slice: string, assistantText: string): boolean {
  const edu =
    /通俗|类比|简单来说|是怎么回事|是什么[？?]|工作流程|三步走|第一步|第二步|第三步|想象一下|就像.{0,12}一样|开卷考试|死记硬背|生活中的类比/i.test(
      slice,
    ) ||
    /\b(RAG|LLM|embedding|vector\s*database|retrieval[- ]augmented)\b/i.test(slice) ||
    /检索增强|向量|知识库|大模型|幻觉|开卷|闭卷|索引|嵌入/i.test(slice) ||
    /讲讲|解释一下|什么是|科普|入门|通俗/i.test(slice);

  const invitesDeeper =
    /想深入了解|深入了解|技术实现|怎么搭建|如何搭建|搭建一个|有什么想|还想了解|比如具体/i.test(
      assistantText,
    );

  return edu || invitesDeeper;
}

function detectContentSignals(slice: string, lower: string): ContentSignals {
  const code = detectHasRealCode(slice, lower);

  const web =
    /https?:\/\//i.test(slice) ||
    /\bwww\.[a-z0-9][a-z0-9.-]*\.[a-z]{2,}\b/i.test(lower) ||
    /\[[^\]]+\]\(https?:[^)]+\)/.test(slice) ||
    /\bRFC\s*\d+/i.test(slice) ||
    /\bdocs?\.[a-z0-9.-]+\.[a-z]{2,}\b/i.test(lower) ||
    /wikipedia\.org/i.test(lower) ||
    /参考文献|参考链接|资料来源|来源[:：]|\bsee also\b|\bread more\b/i.test(slice);

  const email =
    /(^|\n)\s*dear\b[\s,]/im.test(slice) ||
    /best regards|kind regards|sincerely|yours truly|yours sincerely|此致|敬礼|敬上|顺祝|商祺|尊敬的|顺颂|台安/i.test(
      slice,
    ) ||
    /(^|\n)\s*(from|to|cc|bcc)\s*:\s*\S/im.test(slice) ||
    /(^|\n)\s*subject\s*:\s*\S/im.test(slice) ||
    /(^|\n)>\s*On .+wrote:/im.test(slice) ||
    /\b(email|e-mail)\s+(to|from)\b/i.test(lower);

  const date =
    /\d{4}-\d{2}-\d{2}/.test(slice) ||
    /\d{4}年\d{1,2}月/.test(slice) ||
    /q[1-4]\b|\bquarter\b|本季度|deadline|timeline|时间线|排期|里程碑|截止日期/i.test(slice);

  const list = /^[-*•]|\n[-*•]|\n\d+\.\s/.test(slice.trim());
  const table = /\|[^\n]+\|[^\n]+\|/.test(slice);
  const substantial = slice.length > 120;

  return { code, web, email, date, list, table, substantial };
}

function detectUserIntent(ctx: FollowUpContextPack): UserIntent {
  const user = ctx.userText.trim();
  const userLower = user.toLowerCase();
  const assistantLen = ctx.assistantText.trim().length;
  const combinedLen = user.length + assistantLen;

  if (
    /^(好的|嗯+|ok|okay|谢谢|感谢|收到|明白了|知道了|没问题|就按|可以的|好滴|got it|thanks|thank you)[，。!！?\s]*$/i.test(
      user,
    )
  ) {
    return 'chitchat';
  }
  if (/^(hi|hello|hey|你好|在吗|早上好|晚上好)[，。!！?\s]*$/i.test(user)) {
    return 'chitchat';
  }
  if (user.length > 0 && combinedLen < 100 && user.length < 25 && assistantLen < 60) {
    return 'chitchat';
  }

  if (/翻译|译成|翻译成|translate|translation|翻成|译成英文|译成中文/i.test(user)) {
    return 'translation';
  }

  if (
    /还是|对比|vs\.?|versus|哪个好|利弊|相比较|有什么区别|区别是什么|difference between/i.test(user) ||
    /\bcompare\b/i.test(userLower)
  ) {
    return 'compare';
  }

  if (
    /xopc\.json|agents\.list|channels\.|gateway\.|cron\.enabled|botToken/i.test(user) ||
    (/telegram|weixin|微信/i.test(user) && /通道|channel|配置|机器人/i.test(user))
  ) {
    return 'ops';
  }

  if (
    detectHasRealCode(user, userLower) ||
    /\b(debug|fix|implement|refactor|bug)\b/i.test(userLower) ||
    /代码|函数|接口|组件|报错|堆栈|TypeError|SyntaxError/i.test(user)
  ) {
    return 'code';
  }

  if (/写邮件|邮件模板|润色邮件|email draft|起草邮件|正文/i.test(user) || /dear .+,/i.test(user)) {
    return 'email';
  }

  if (/查一下|搜索|检索|find sources|look up|资料来源|帮我查|网上查/i.test(user)) {
    return 'research';
  }

  if (/帮我想|标题|文案|起名|头脑风暴|slogan|广告语|公众号/i.test(user)) {
    return 'creative';
  }

  return 'unknown';
}

function userWantsFormattedOutput(userText: string): boolean {
  return /总结|要点|列表|表格|summarize|bullet|table format|整理成|列出来/i.test(userText);
}

function mergeContentSignals(user: ContentSignals, assistant: ContentSignals): ContentSignals {
  return {
    code: user.code || assistant.code,
    web: user.web || assistant.web,
    email: user.email || assistant.email,
    date: user.date || assistant.date,
    list: false,
    table: false,
    substantial: assistant.substantial,
  };
}

function cjkRatio(text: string): number {
  if (!text.length) return 0;
  let cjk = 0;
  for (const ch of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) cjk += 1;
  }
  return cjk / text.length;
}

function detectDerived(
  ctx: FollowUpContextPack,
  userContent: ContentSignals,
  assistantContent: ContentSignals,
  intent: UserIntent,
): DerivedSignals {
  const combined = [ctx.userText, ctx.assistantText, ...ctx.recentUserTexts, ctx.recentAssistantSnippet]
    .filter(Boolean)
    .join('\n');
  const assistantLower = ctx.assistantText.toLowerCase();
  const userLower = ctx.userText.toLowerCase();
  const wantsFormat = userWantsFormattedOutput(ctx.userText);

  const content = mergeContentSignals(userContent, assistantContent);
  content.list = assistantContent.list && wantsFormat;
  content.table = assistantContent.table && wantsFormat;

  const toolsUsedWebSearch = ctx.assistantToolUses.some(
    (t) => t.name === 'web_search' && t.status === 'done',
  );
  const toolsUsedWrite = ctx.assistantToolUses.some(
    (t) => (t.name === 'write_file' || t.name === 'edit_file') && t.status === 'done',
  );
  const toolsUsedShell = ctx.assistantToolUses.some((t) => t.name === 'shell');
  const toolsUsedBrowser = ctx.assistantToolUses.some(
    (t) => t.name === 'browser_use' || t.name.startsWith('browser_'),
  );
  const anyToolError = ctx.assistantToolUses.some((t) => t.status === 'error');

  const taskDebug =
    /\b(error|exception|traceback|failed|failure|panic|stack trace|typeerror|referenceerror|syntaxerror)\b/i.test(
      combined,
    ) ||
    /报错|异常|失败|错误|堆栈/.test(combined) ||
    anyToolError ||
    ctx.assistantToolUses.some((t) => /error|exit code|failed/i.test(t.resultPreview ?? ''));

  const taskImplement =
    toolsUsedWrite ||
    /\b(implement|add a|create a|write a|build a|实现|添加|写一个|新增)\b/i.test(userLower);

  const taskReview =
    /\b(review|check for issues|audit|inspect|审查|检查|看看有没有问题)\b/i.test(userLower) ||
    /\bdiff\b|pull request|\bPR\b|改动文件|代码审查/i.test(assistantLower);

  const taskEducational = detectEducational(combined, ctx.assistantText);
  const hasRealCode =
    detectHasRealCode(ctx.userText, ctx.userText.toLowerCase()) ||
    detectHasRealCode(ctx.assistantText, ctx.assistantText.toLowerCase());

  const taskPlan =
    (/\b(plan|steps|how to|roadmap|计划|步骤|怎么做|方案)\b/i.test(userLower) ||
      (/\n\s*\d+\.\s/.test(ctx.assistantText) && wantsFormat)) &&
    !taskEducational;

  const taskConfig =
    /xopc\.json|agents\.list|providers|gateway\.|channels\.|cron\.enabled|botToken/i.test(combined) &&
    intent === 'ops';

  const taskResearch =
    toolsUsedWebSearch ||
    intent === 'research' ||
    /\b(search|look up|find sources|资料|查一下|检索|来源)\b/i.test(userLower);

  const taskCompare =
    intent === 'compare' ||
    /\b(compare|versus|vs\.?|which is better)\b/i.test(userLower) ||
    /(哪个好|对比|利弊|还是|有什么区别|区别是什么)/.test(ctx.userText) ||
    /\b(option a|option b|either\b)/i.test(assistantLower);

  const taskTest =
    /\b(test|tests|vitest|jest|pytest|coverage|单元测试|测试用例)\b/i.test(combined);

  const taskGit =
    /\b(git|commit|branch|merge|rebase|pull request|\bPR\b|提交|分支)\b/i.test(combined);

  const assistantTrim = ctx.assistantText.trim();
  const assistantAlreadyBullets = /^[-*•]|\n[-*•]|\n\d+\.\s/m.test(assistantTrim);
  const assistantAlreadyTable = /\|[^\n]+\|[^\n]+\|/.test(assistantTrim);
  const assistantAlreadyShort = assistantTrim.length < 120;
  const assistantOffersOptions =
    /\b(you can|either\b|options?:|可选|你可以|或者)\b/i.test(assistantLower);

  const userLangZh = ctx.locale === 'zh' || cjkRatio(combined) > 0.12;

  return {
    ...content,
    code: content.code && hasRealCode,
    taskEducational,
    hasRealCode,
    taskDebug,
    taskImplement,
    taskReview,
    taskPlan,
    taskConfig,
    taskResearch,
    taskCompare,
    taskTest,
    taskGit,
    assistantAlreadyBullets,
    assistantAlreadyTable,
    assistantAlreadyShort,
    assistantOffersOptions,
    userLangZh,
    toolsUsedWebSearch,
    toolsUsedWrite,
    toolsUsedShell,
    toolsUsedBrowser,
    anyToolError,
    userIntent: intent,
    userWantsFormattedOutput: wantsFormat,
  };
}

function familyMaxForSignals(s: DerivedSignals): Record<FollowUpFamily, number> {
  const m = { ...BASE_FAMILY_MAX };
  if (s.code && s.web) m.code = Math.min(m.code, 2);
  if (s.code && s.email) m.code = Math.min(m.code, 2);
  if (s.code && s.date) m.code = Math.min(m.code, 2);
  if (s.web && s.email) {
    m.web = Math.min(m.web, 1);
    m.email = Math.min(m.email, 1);
  }
  if (s.taskConfig) m.ops = 1;
  if (s.taskGit || s.taskTest) m.workflow = 1;
  if (s.taskEducational) {
    m.code = 0;
    m.learn = 2;
  }
  if (s.userIntent === 'compare') {
    m.workflow = 1;
    m.generic = 0;
  }
  return m;
}

function isIdAllowed(id: FollowUpSuggestionId, ctx: FollowUpContextPack, d: DerivedSignals): boolean {
  const { capabilities: cap } = ctx;
  if (id === 'web_more_details' || id === 'web_find_sources' || id === 'research_deeper') {
    if (!cap.capWebSearch) return false;
  }
  if (id === 'web_verify_claim' && !cap.capWebSearch) return false;
  if (id === 'wf_run_checks' && !cap.capShell) return false;
  if (id === 'wf_git_commit' && !cap.capShell) return false;
  if (id === 'code_add_tests' || id === 'code_fix_error') {
    if (!cap.capShell && !d.toolsUsedWrite) return false;
  }
  if (id === 'ops_schedule_cron' && !cap.capCron) return false;

  if (d.userIntent === 'translation' || d.userIntent === 'chitchat') return false;

  if (d.userIntent === 'creative') {
    if (id.startsWith('code_') || id.startsWith('ops_') || id.startsWith('date_')) return false;
    if (id === 'research_deeper' || id.startsWith('web_')) return false;
  }

  if (d.userIntent === 'compare' && id.startsWith('generic_')) return false;

  if (
    (d.userIntent === 'unknown' || d.userIntent === 'creative') &&
    id.startsWith('generic_') &&
    !d.taskEducational &&
    !d.taskPlan &&
    !d.userWantsFormattedOutput
  ) {
    return false;
  }

  return true;
}

function multiply(m: Map<FollowUpSuggestionId, number>, id: FollowUpSuggestionId, factor: number) {
  if (!m.has(id)) return;
  m.set(id, (m.get(id) ?? 0) * factor);
}

function hasStrongDomainSignal(d: DerivedSignals): boolean {
  return (
    (d.code && d.hasRealCode) ||
    d.web ||
    d.email ||
    d.date ||
    d.taskDebug ||
    d.taskCompare ||
    d.taskEducational ||
    d.taskConfig ||
    d.taskGit ||
    d.taskTest ||
    d.taskImplement ||
    d.taskResearch ||
    d.toolsUsedWrite ||
    d.toolsUsedWebSearch ||
    d.anyToolError
  );
}

function scoreIds(ctx: FollowUpContextPack, d: DerivedSignals): Map<FollowUpSuggestionId, number> {
  const combined = [ctx.userText, ctx.assistantText, ...ctx.recentUserTexts].filter(Boolean).join('\n');
  const m = new Map<FollowUpSuggestionId, number>();
  for (const id of ALL_IDS) {
    if (isIdAllowed(id, ctx, d)) m.set(id, 0);
  }

  const add = (id: FollowUpSuggestionId, v: number) => {
    if (!m.has(id)) return;
    m.set(id, (m.get(id) ?? 0) + v);
  };

  if (d.code) {
    add('code_error_handling', 52);
    add('code_explain', 51);
    add('code_refactor', 50);
    add('code_optimize', 49);
    add('code_add_tests', 48);
    add('code_fix_error', 47);
  }
  if (d.web) {
    add('web_more_details', 48);
    add('web_find_sources', 47);
    add('web_verify_claim', 46);
  }
  if (d.email) {
    add('email_make_formal', 46);
    add('email_shorten', 45);
    if (d.userLangZh) {
      add('email_make_formal', 3);
      add('email_shorten', 3);
    }
  }
  if (d.date) {
    add('date_shorter_summary', 44);
    add('date_main_risks', 43);
  }

  if (d.list) {
    add('generic_bullet_points', 28);
    add('generic_create_table', 26);
    add('generic_action_checklist', 24);
  }
  if (d.table && d.userWantsFormattedOutput) {
    add('generic_create_table', 22);
    add('generic_bullet_points', 18);
  }

  if (d.taskDebug) {
    add('code_fix_error', 24);
    add('code_error_handling', 15);
    add('code_explain', 8);
  }
  if (d.taskImplement) {
    add('code_add_tests', 16);
    add('wf_run_checks', 14);
    add('code_refactor', 6);
  }
  if (d.taskReview) {
    add('code_refactor', 14);
    add('wf_verify_acceptance', 12);
    add('generic_assumptions', 8);
  }
  if (d.taskPlan) {
    add('generic_action_checklist', 20);
    add('what_next', 8);
    add('date_main_risks', 6);
  }
  if (d.taskConfig) {
    add('ops_fix_config', 22);
    add('ops_channel_next', 10);
  }
  if (d.taskResearch) {
    add('research_deeper', 18);
    add('web_find_sources', 10);
    add('web_verify_claim', 8);
  }
  if (d.taskEducational) {
    add('learn_technical_detail', 50);
    add('learn_build_walkthrough', 49);
    add('learn_compare_alternatives', 48);
    add('generic_concrete_example', 42);
    if (d.taskResearch || d.web) {
      add('research_deeper', 38);
      add('web_more_details', 36);
    }
    if (/技术实现|实现细节|原理|架构/i.test(ctx.assistantText) || /技术实现/i.test(ctx.userText)) {
      add('learn_technical_detail', 12);
    }
    if (/搭建|部署|动手|实践|demo/i.test(combined)) {
      add('learn_build_walkthrough', 14);
    }
    if (/对比|相比|区别|vs|或者/i.test(ctx.assistantText)) {
      add('learn_compare_alternatives', 10);
    }
  }
  if (d.taskCompare) {
    add('wf_compare_options', 40);
    add('learn_compare_alternatives', 12);
  }
  if (d.taskTest) {
    add('wf_run_checks', 20);
    add('code_add_tests', 12);
  }
  if (d.taskGit) {
    add('wf_git_commit', 22);
    add('code_refactor', 5);
  }

  if (d.toolsUsedWebSearch) add('web_verify_claim', 12);
  if (d.toolsUsedWrite) {
    add('code_add_tests', 14);
    add('wf_run_checks', 12);
    add('wf_git_commit', 10);
  }
  if (d.toolsUsedShell && d.taskDebug) add('code_fix_error', 10);
  if (d.toolsUsedShell && !d.taskDebug) add('wf_run_checks', 8);
  if (d.toolsUsedBrowser) add('web_verify_claim', 6);
  if (d.anyToolError) add('code_fix_error', 12);

  if (/xopc\.json|agents\.list|providers|gateway\.|workspace/i.test(ctx.userText) && d.userIntent === 'ops') {
    add('ops_fix_config', 16);
  }
  if (/telegram|weixin|botToken/i.test(ctx.userText) && /通道|channel|配置/i.test(ctx.userText)) {
    add('ops_channel_next', 22);
  }
  if (/cron|定时|schedule|remind/i.test(ctx.userText) && d.userIntent === 'ops') {
    add('ops_schedule_cron', 20);
  }

  const recentHasEmail =
    ctx.recentUserTexts.some((t) => detectContentSignals(t, t.toLowerCase()).email) ||
    detectContentSignals(ctx.recentAssistantSnippet, ctx.recentAssistantSnippet.toLowerCase()).email;
  if (recentHasEmail && d.assistantAlreadyShort && d.userIntent === 'email') {
    add('email_make_formal', 12);
    add('email_shorten', 12);
  }
  const recentHasCode = ctx.recentUserTexts.some(
    (t) => detectContentSignals(t, t.toLowerCase()).code,
  );
  if (recentHasCode && !d.code && d.userIntent === 'code') add('code_explain', 10);

  if (ctx.priorTurnCount >= 3 && hasStrongDomainSignal(d)) {
    add('what_next', 6);
  }
  if (d.taskPlan || d.taskImplement) {
    add('what_next', 10);
  }

  if (ctx.userHasAttachments && d.taskEducational) add('generic_simpler_terms', 6);

  if (d.assistantAlreadyBullets) multiply(m, 'generic_bullet_points', 0.2);
  if (d.assistantAlreadyTable) multiply(m, 'generic_create_table', 0.2);
  if (d.assistantAlreadyShort) multiply(m, 'generic_simpler_terms', 0.3);
  if (d.taskResearch && d.toolsUsedWebSearch) {
    for (const id of ALL_IDS) {
      if (id.startsWith('generic_')) multiply(m, id, 0.5);
    }
  }
  if (d.code && !d.web && !d.email) {
    for (const id of ALL_IDS) {
      if (id.startsWith('generic_')) multiply(m, id, 0.55);
    }
  }
  if (d.toolsUsedWebSearch) {
    multiply(m, 'web_more_details', 0.35);
    multiply(m, 'research_deeper', 0.35);
    multiply(m, 'web_verify_claim', 0.5);
  }
  if (d.taskDebug) {
    multiply(m, 'code_explain', 0.85);
    multiply(m, 'code_refactor', 0.85);
    multiply(m, 'code_optimize', 0.85);
    multiply(m, 'code_error_handling', 1.15);
    multiply(m, 'code_fix_error', 1.15);
  }
  if (d.assistantOffersOptions) multiply(m, 'wf_compare_options', 1.2);
  if (d.taskEducational && !d.hasRealCode) {
    for (const id of ALL_IDS) {
      if (id.startsWith('code_')) multiply(m, id, 0.06);
    }
    multiply(m, 'generic_action_checklist', 0.15);
    multiply(m, 'generic_simpler_terms', 0.25);
    multiply(m, 'code_explain', 0.06);
  }
  if (!d.substantial) {
    multiply(m, 'date_shorter_summary', 0.7);
    multiply(m, 'email_shorten', 0.7);
  }

  if (!hasStrongDomainSignal(d)) {
    for (const id of ALL_IDS) {
      if (id.startsWith('generic_') || id === 'research_deeper' || id === 'what_next') {
        multiply(m, id, 0.05);
      }
    }
  }

  return m;
}

function selectFollowUps(
  scores: Map<FollowUpSuggestionId, number>,
  signals: DerivedSignals,
  ctx: FollowUpContextPack,
): FollowUpSuggestionId[] {
  const eligible = [...scores.keys()].filter((id) => (scores.get(id) ?? 0) >= MIN_CHIP_SCORE);

  if (eligible.length === 0) return [];

  const ranked = eligible.sort((a, b) => {
    const diff = (scores.get(b) ?? 0) - (scores.get(a) ?? 0);
    if (diff !== 0) return diff;
    return ALL_IDS.indexOf(a) - ALL_IDS.indexOf(b);
  });

  const familyMax = familyMaxForSignals(signals);

  const familyUsed: Record<FollowUpFamily, number> = {
    code: 0,
    web: 0,
    email: 0,
    date: 0,
    generic: 0,
    meta: 0,
    ops: 0,
    workflow: 0,
    learn: 0,
  };
  const picked: FollowUpSuggestionId[] = [];
  const pickedSet = new Set<FollowUpSuggestionId>();

  const tryPick = (id: FollowUpSuggestionId): boolean => {
    if (picked.length >= 4 || pickedSet.has(id)) return false;
    if (!scores.has(id)) return false;
    if ((scores.get(id) ?? 0) < MIN_CHIP_SCORE) return false;
    const fam = familyOf(id);
    if (familyUsed[fam] >= familyMax[fam]) return false;
    picked.push(id);
    pickedSet.add(id);
    familyUsed[fam] += 1;
    return true;
  };

  const nonWhatNext = ranked.filter((id) => id !== 'what_next');
  for (const id of nonWhatNext) {
    if (picked.filter((x) => familyOf(x) !== 'meta').length >= 3) break;
    tryPick(id);
  }

  const domainCount = picked.filter((x) => familyOf(x) !== 'meta').length;
  const whatNextScore = scores.get('what_next') ?? 0;
  const mayShowWhatNext =
    domainCount >= 1 &&
    whatNextScore >= MIN_WHAT_NEXT_SCORE &&
    (signals.taskPlan || signals.taskImplement || ctx.priorTurnCount >= 2 || hasStrongDomainSignal(signals));

  if (mayShowWhatNext && !pickedSet.has('what_next')) {
    tryPick('what_next');
  }

  for (const id of nonWhatNext) {
    if (picked.length >= 4) break;
    tryPick(id);
  }

  const metaIdx = picked.indexOf('what_next');
  if (metaIdx >= 0 && metaIdx < picked.length - 1) {
    const [wn] = picked.splice(metaIdx, 1);
    picked.push(wn);
  }

  if (picked.filter((x) => familyOf(x) !== 'meta').length === 0) return [];

  return picked.slice(0, 4);
}

/**
 * Score follow-up chips from a full context pack (phase-1 heuristic).
 * Returns an empty list when nothing is confidently relevant.
 */
export function suggestFollowUps(ctx: FollowUpContextPack): FollowUpSuggestionId[] {
  if (ctx.clarifyActive) return [];

  const combinedSlice = [ctx.userText, ctx.assistantText, ...ctx.recentUserTexts].filter(Boolean).join('\n');
  if (!combinedSlice.trim()) return [];

  const intent = detectUserIntent(ctx);
  if (intent === 'chitchat' || intent === 'translation') return [];

  const userContent = detectContentSignals(ctx.userText, ctx.userText.toLowerCase());
  const assistantContent = detectContentSignals(ctx.assistantText, ctx.assistantText.toLowerCase());
  const derived = detectDerived(ctx, userContent, assistantContent, intent);
  const scores = scoreIds(ctx, derived);
  return selectFollowUps(scores, derived, ctx);
}

/**
 * Cheap follow-up prompts after an assistant turn (no extra LLM call).
 * Prefer {@link suggestFollowUps} with {@link buildFollowUpContextPack} when transcript is available.
 */
export function suggestFollowUpsFromAssistantMessage(msg: Message): FollowUpSuggestionId[] {
  if (msg.role !== 'assistant') return [];
  const ctx = buildFollowUpContextPack({
    messages: [msg],
    appendedAssistant: msg,
  });
  if (!ctx) return [];
  return suggestFollowUps(ctx);
}

export { buildFollowUpContextPack, collectPlainTextFromContent } from './follow-up-context';
export type {
  BuildFollowUpContextInput,
  FollowUpCapabilities,
  FollowUpContextPack,
  ToolUseSummary,
} from './follow-up-context';
export { DEFAULT_FOLLOW_UP_CAPABILITIES } from './follow-up-context';
