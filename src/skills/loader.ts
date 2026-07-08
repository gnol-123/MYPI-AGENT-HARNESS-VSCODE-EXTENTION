import * as fs from 'fs/promises';
import * as path from 'path';

export interface Skill {
  name: string;
  description: string;
  instructions: string;
  location: string;
}

function parseFrontmatter(content: string): { data: Record<string, string>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: content };
  }

  const frontmatterText = match[1];
  const body = match[2];

  const data: Record<string, string> = {};
  for (const line of frontmatterText.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      data[key] = value;
    }
  }

  return { data, body };
}

export async function loadSkills(skillsDir: string): Promise<Skill[]> {
  const skills: Skill[] = [];

  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillPath = path.join(skillsDir, entry.name);
      const skillMdPath = path.join(skillPath, 'SKILL.md');

      try {
        const content = await fs.readFile(skillMdPath, 'utf-8');
        const { data, body } = parseFrontmatter(content);

        skills.push({
          name: data.name ?? entry.name,
          description: data.description ?? '',
          instructions: body.trim(),
          location: skillPath,
        });
      } catch {
        // Skip directories without valid SKILL.md
      }
    }
  } catch {
    // Skills dir doesn't exist or can't be read
  }

  return skills;
}

export function matchSkills(skills: Skill[], userMessage: string): Skill[] {
  const messageLower = userMessage.toLowerCase();
  const matched: Skill[] = [];

  for (const skill of skills) {
    const keywords = skill.description.toLowerCase().split(/\s+/);
    const matchCount = keywords.filter((kw) => kw.length > 3 && messageLower.includes(kw)).length;

    if (matchCount >= 2) {
      matched.push(skill);
    }
  }

  return matched;
}
