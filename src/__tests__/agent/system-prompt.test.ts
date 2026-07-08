import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../../agent/system-prompt';
import { Skill } from '../../skills/loader';

describe('buildSystemPrompt', () => {
  it('should include base prompt and skills', () => {
    const skills: Skill[] = [
      { name: 'test', description: 'test skill', instructions: 'Do the thing.', location: '/fake' },
    ];

    const prompt = buildSystemPrompt(skills, 'test task');
    expect(prompt).toContain("SL's PI");
    expect(prompt).toContain('Do the thing.');
  });

  it('should work with empty skills', () => {
    const prompt = buildSystemPrompt([], 'test task');
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('should include task if provided', () => {
    const prompt = buildSystemPrompt([], 'fix the bug');
    expect(prompt).toContain('fix the bug');
  });
});
