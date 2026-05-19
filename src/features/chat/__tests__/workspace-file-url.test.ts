import { describe, expect, it } from 'vitest';

import { workspaceRelativePathToApiPath } from '../workspace-file-url';

describe('workspaceRelativePathToApiPath', () => {
  it('uses inbound-file for inbound paths', () => {
    expect(workspaceRelativePathToApiPath('inbound/s/voice.m4a')).toBe(
      '/api/workspace/inbound-file?rel=inbound%2Fs%2Fvoice.m4a',
    );
  });

  it('uses tts-file for tts paths', () => {
    expect(workspaceRelativePathToApiPath('tts/out.mp3', { sessionKey: 'main:webchat:default:direct:chat_1' })).toBe(
      '/api/workspace/tts-file?rel=tts%2Fout.mp3&sessionKey=main%3Awebchat%3Adefault%3Adirect%3Achat_1',
    );
  });
});
