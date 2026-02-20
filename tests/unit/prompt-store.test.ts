import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';

import { PromptStore } from '../../src/core/prompt-store.js';

const DEFAULT_PROMPT_NAMES = ['agent-system', 'issue-triage', 'issue-implementer', 'review-agent'];

describe('PromptStore', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'codefactory-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('ensureDefaults creates .codefactory/prompts/ with all 4 default prompt files', async () => {
    const store = new PromptStore(tempDir);
    await store.ensureDefaults();

    const promptsDir = join(tempDir, '.codefactory', 'prompts');
    expect(existsSync(promptsDir)).toBe(true);

    for (const name of DEFAULT_PROMPT_NAMES) {
      const filePath = join(promptsDir, `${name}.md`);
      expect(existsSync(filePath)).toBe(true);

      const content = await readFile(filePath, 'utf-8');
      expect(content.length).toBeGreaterThan(0);
    }
  });

  it('ensureDefaults does not overwrite existing files', async () => {
    const store = new PromptStore(tempDir);

    // Create the directory and write custom content for one prompt
    const promptsDir = join(tempDir, '.codefactory', 'prompts');
    await mkdir(promptsDir, { recursive: true });
    const customContent = 'My custom agent-system prompt';
    await writeFile(join(promptsDir, 'agent-system.md'), customContent, 'utf-8');

    // Call ensureDefaults — it should NOT overwrite the existing file
    await store.ensureDefaults();

    const content = await readFile(join(promptsDir, 'agent-system.md'), 'utf-8');
    expect(content).toBe(customContent);

    // Other files should still be created
    for (const name of DEFAULT_PROMPT_NAMES.filter((n) => n !== 'agent-system')) {
      expect(existsSync(join(promptsDir, `${name}.md`))).toBe(true);
    }
  });

  it('list returns 4 entries with name, displayName, and description', () => {
    const store = new PromptStore(tempDir);
    const entries = store.list();

    expect(entries).toHaveLength(4);

    for (const entry of entries) {
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('displayName');
      expect(entry).toHaveProperty('description');
      expect(typeof entry.name).toBe('string');
      expect(typeof entry.displayName).toBe('string');
      expect(typeof entry.description).toBe('string');
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.displayName.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }

    const names = entries.map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(DEFAULT_PROMPT_NAMES));
  });

  it('getPath returns correct path under .codefactory/prompts/<name>.md', () => {
    const store = new PromptStore(tempDir);

    for (const name of DEFAULT_PROMPT_NAMES) {
      const expected = join(tempDir, '.codefactory', 'prompts', `${name}.md`);
      expect(store.getPath(name)).toBe(expected);
    }
  });

  it('read returns file content after ensureDefaults', async () => {
    const store = new PromptStore(tempDir);
    await store.ensureDefaults();

    for (const name of DEFAULT_PROMPT_NAMES) {
      const content = await store.read(name);
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);

      // Content should match what getDefault returns
      const defaultContent = store.getDefault(name);
      expect(content).toBe(defaultContent);
    }
  });

  it('write saves new content to disk', async () => {
    const store = new PromptStore(tempDir);
    await store.ensureDefaults();

    const newContent = 'Updated prompt content for testing';
    await store.write('agent-system', newContent);

    const onDisk = await readFile(store.getPath('agent-system'), 'utf-8');
    expect(onDisk).toBe(newContent);

    const readBack = await store.read('agent-system');
    expect(readBack).toBe(newContent);
  });

  it('resetToDefault overwrites custom content with default', async () => {
    const store = new PromptStore(tempDir);
    await store.ensureDefaults();

    const customContent = 'This is custom content that should be overwritten';
    await store.write('review-agent', customContent);

    // Verify custom content is in place
    const beforeReset = await store.read('review-agent');
    expect(beforeReset).toBe(customContent);

    // Reset to default
    await store.resetToDefault('review-agent');

    const afterReset = await store.read('review-agent');
    const defaultContent = store.getDefault('review-agent');
    expect(afterReset).toBe(defaultContent);
    expect(afterReset).not.toBe(customContent);
  });

  it('getDefault returns content for known names, null for unknown', () => {
    const store = new PromptStore(tempDir);

    for (const name of DEFAULT_PROMPT_NAMES) {
      const content = store.getDefault(name);
      expect(content).not.toBeNull();
      expect(typeof content).toBe('string');
      expect(content!.length).toBeGreaterThan(0);
    }

    expect(store.getDefault('nonexistent-prompt')).toBeNull();
    expect(store.getDefault('')).toBeNull();
    expect(store.getDefault('unknown')).toBeNull();
  });

  it('isCustomized returns false for default content, true after write', async () => {
    const store = new PromptStore(tempDir);
    await store.ensureDefaults();

    // All prompts should be at their defaults initially
    for (const name of DEFAULT_PROMPT_NAMES) {
      const customized = await store.isCustomized(name);
      expect(customized).toBe(false);
    }

    // Write custom content to one prompt
    await store.write('issue-triage', 'Custom triage instructions');
    expect(await store.isCustomized('issue-triage')).toBe(true);

    // Other prompts should still be at defaults
    expect(await store.isCustomized('agent-system')).toBe(false);
    expect(await store.isCustomized('review-agent')).toBe(false);
  });

  it('resetToDefault throws for unknown prompt name', async () => {
    const store = new PromptStore(tempDir);

    await expect(store.resetToDefault('nonexistent-prompt')).rejects.toThrow(
      'Unknown prompt: nonexistent-prompt',
    );
  });
});
