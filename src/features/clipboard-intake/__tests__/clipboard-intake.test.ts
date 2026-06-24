import { describe, expect, it } from 'vitest';

import { isLatestAppClipboardHash, rememberAppClipboardText } from '../app-clipboard-origin';
import { hashClipboardText } from '../clipboard-hash';

describe('hashClipboardText', () => {
  it('returns a stable hash for identical text', () => {
    expect(hashClipboardText('hello')).toBe(hashClipboardText('hello'));
  });

  it('returns different hashes for different text', () => {
    expect(hashClipboardText('hello')).not.toBe(hashClipboardText('hello!'));
  });
});

describe('app clipboard origin', () => {
  it('recognizes the latest app-written clipboard text by hash', () => {
    rememberAppClipboardText('  copied in app  ');

    expect(isLatestAppClipboardHash(hashClipboardText('copied in app'))).toBe(true);
    expect(isLatestAppClipboardHash(hashClipboardText('copied elsewhere'))).toBe(false);
  });

  it('keeps only the latest app-written clipboard hash', () => {
    rememberAppClipboardText('first copy');
    rememberAppClipboardText('second copy');

    expect(isLatestAppClipboardHash(hashClipboardText('first copy'))).toBe(false);
    expect(isLatestAppClipboardHash(hashClipboardText('second copy'))).toBe(true);
  });

  it('clears the remembered hash when app-written text is empty', () => {
    rememberAppClipboardText('copied in app');
    rememberAppClipboardText('   ');

    expect(isLatestAppClipboardHash(hashClipboardText('copied in app'))).toBe(false);
  });
});
