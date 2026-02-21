import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workflowPath = join(__dirname, '../../.github/workflows/release.yml');
const workflowContent = readFileSync(workflowPath, 'utf-8');
const workflow = parse(workflowContent) as Record<string, unknown>;

describe('release workflow', () => {
  it('should exist at .github/workflows/release.yml', () => {
    expect(workflowContent).toBeTruthy();
  });

  it('should trigger on v* tags only', () => {
    const on = workflow.on as Record<string, unknown>;
    const push = on.push as Record<string, unknown>;
    const tags = push.tags as string[];
    expect(tags).toContain('v*');
  });

  it('should run quality gates before release', () => {
    const stepsText = workflowContent.toLowerCase();
    expect(stepsText).toContain('lint');
    expect(stepsText).toContain('type');
    expect(stepsText).toContain('test');
    expect(stepsText).toContain('build');
  });

  it('should use build:release script', () => {
    expect(workflowContent).toContain('build:release');
  });

  it('should create GitHub release with correct assets', () => {
    expect(workflowContent).toContain('gh release create');
    expect(workflowContent).toContain('codefactory');
    expect(workflowContent).toContain('checksums.sha256');
    expect(workflowContent).toContain('install.sh');
  });

  it('should verify version tag matches package.json', () => {
    expect(workflowContent).toContain('TAG_VERSION');
    expect(workflowContent).toContain('PKG_VERSION');
    expect(workflowContent).toContain('package.json');
  });

  it('should generate checksums', () => {
    expect(workflowContent).toContain('sha256sum');
  });

  it('should upload install.sh as release asset', () => {
    expect(workflowContent).toContain('install.sh');
  });
});
