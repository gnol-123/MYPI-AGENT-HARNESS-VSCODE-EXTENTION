import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs/promises';
import { loadSkills, matchSkills, Skill } from '../../skills/loader';

vi.mock('fs/promises');

describe('skills loader', () => {
  it('should load a skill from a SKILL.md file', async () => {
    const skillMd = `---
name: test-skill
description: A test skill for testing
---

# Test Skill

These are the instructions.`;

    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'test-skill', isDirectory: () => true },
    ] as any);
    vi.mocked(fs.readFile).mockResolvedValue(skillMd);

    const skills = await loadSkills('/fake/skills');
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('test-skill');
    expect(skills[0].description).toBe('A test skill for testing');
    expect(skills[0].instructions).toContain('These are the instructions');
  });

  it('should skip directories without SKILL.md', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'no-skill', isDirectory: () => true },
    ] as any);
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

    const skills = await loadSkills('/fake/skills');
    expect(skills).toHaveLength(0);
  });

  it('should handle missing skills directory', async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

    const skills = await loadSkills('/nonexistent');
    expect(skills).toHaveLength(0);
  });
});

describe('matchSkills', () => {
  const skills: Skill[] = [
    { name: 'brainstorming', description: 'Use before any creative work', instructions: '...', location: '/fake' },
    { name: 'debugging', description: 'Use when encountering any bug', instructions: '...', location: '/fake' },
  ];

  it('should match skills based on description keywords', () => {
    const matched = matchSkills(skills, 'I want to build a new feature using creative work');
    expect(matched).toHaveLength(1);
    expect(matched[0].name).toBe('brainstorming');
  });

  it('should return empty for no match', () => {
    const matched = matchSkills(skills, 'Can you explain this?');
    expect(matched).toHaveLength(0);
  });
});
