import { describe, expect, it } from 'vitest';

import { detectActiveFormats, toggleInlineFormat } from '../editor/inline-format';

describe('toggleInlineFormat', () => {
  describe('bold', () => {
    it('wraps selected text with **', () => {
      const result = toggleInlineFormat('hello world', 6, 11, 'bold');
      expect(result.text).toBe('hello **world**');
      expect(result.selectionStart).toBe(8);
      expect(result.selectionEnd).toBe(13);
    });

    it('unwraps already bold text (delimiters outside selection)', () => {
      const result = toggleInlineFormat('hello **world**', 8, 13, 'bold');
      expect(result.text).toBe('hello world');
      expect(result.selectionStart).toBe(6);
      expect(result.selectionEnd).toBe(11);
    });

    it('unwraps already bold text (delimiters inside selection)', () => {
      const result = toggleInlineFormat('hello **world**', 6, 15, 'bold');
      expect(result.text).toBe('hello world');
      expect(result.selectionStart).toBe(6);
      expect(result.selectionEnd).toBe(11);
    });

    it('inserts empty delimiters at cursor', () => {
      const result = toggleInlineFormat('hello', 5, 5, 'bold');
      expect(result.text).toBe('hello****');
      expect(result.selectionStart).toBe(7);
      expect(result.selectionEnd).toBe(7);
    });
  });

  describe('italic', () => {
    it('wraps selected text with *', () => {
      const result = toggleInlineFormat('hello world', 0, 5, 'italic');
      expect(result.text).toBe('*hello* world');
      expect(result.selectionStart).toBe(1);
      expect(result.selectionEnd).toBe(6);
    });

    it('unwraps already italic text', () => {
      const result = toggleInlineFormat('*hello* world', 1, 6, 'italic');
      expect(result.text).toBe('hello world');
      expect(result.selectionStart).toBe(0);
      expect(result.selectionEnd).toBe(5);
    });
  });

  describe('strikethrough', () => {
    it('wraps with ~~', () => {
      const result = toggleInlineFormat('done task', 0, 4, 'strikethrough');
      expect(result.text).toBe('~~done~~ task');
      expect(result.selectionStart).toBe(2);
      expect(result.selectionEnd).toBe(6);
    });

    it('unwraps ~~', () => {
      const result = toggleInlineFormat('~~done~~ task', 2, 6, 'strikethrough');
      expect(result.text).toBe('done task');
      expect(result.selectionStart).toBe(0);
      expect(result.selectionEnd).toBe(4);
    });
  });

  describe('code', () => {
    it('wraps with backtick', () => {
      const result = toggleInlineFormat('use useState hook', 4, 12, 'code');
      expect(result.text).toBe('use `useState` hook');
      expect(result.selectionStart).toBe(5);
      expect(result.selectionEnd).toBe(13);
    });

    it('unwraps backtick', () => {
      const result = toggleInlineFormat('use `useState` hook', 5, 13, 'code');
      expect(result.text).toBe('use useState hook');
      expect(result.selectionStart).toBe(4);
      expect(result.selectionEnd).toBe(12);
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      const result = toggleInlineFormat('', 0, 0, 'bold');
      expect(result.text).toBe('****');
      expect(result.selectionStart).toBe(2);
    });

    it('handles selection at start of text', () => {
      const result = toggleInlineFormat('hello', 0, 5, 'bold');
      expect(result.text).toBe('**hello**');
    });

    it('handles full text selection bold toggle round-trip', () => {
      const wrap = toggleInlineFormat('hello', 0, 5, 'bold');
      expect(wrap.text).toBe('**hello**');
      const unwrap = toggleInlineFormat(wrap.text, wrap.selectionStart, wrap.selectionEnd, 'bold');
      expect(unwrap.text).toBe('hello');
    });
  });
});

describe('detectActiveFormats', () => {
  it('detects bold when delimiters surround selection', () => {
    // 'say **hello** world' → ** at 4-5, hello at 6-10, ** at 11-12
    const formats = detectActiveFormats('say **hello** world', 5, 10);
    expect(formats.has('bold')).toBe(false);

    const formats2 = detectActiveFormats('say **hello** world', 6, 11);
    expect(formats2.has('bold')).toBe(true);
  });

  it('detects italic', () => {
    const formats = detectActiveFormats('say *hello* world', 5, 10);
    expect(formats.has('italic')).toBe(true);
  });

  it('detects code', () => {
    const formats = detectActiveFormats('use `useState` hook', 5, 13);
    expect(formats.has('code')).toBe(true);
  });

  it('returns empty set for unformatted text', () => {
    const formats = detectActiveFormats('plain text', 0, 5);
    expect(formats.size).toBe(0);
  });
});
