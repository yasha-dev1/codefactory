import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(__dirname, '../../scripts/install.sh');
const scriptContent = readFileSync(scriptPath, 'utf-8');
const scriptLines = scriptContent.split('\n');

describe('install.sh', () => {
  it('should exist at scripts/install.sh', () => {
    expect(scriptContent).toBeTruthy();
  });

  it('should have a bash shebang', () => {
    expect(scriptLines[0]).toMatch(/^#!.*bash/);
  });

  it('should check for Node.js >= 20', () => {
    expect(scriptContent).toMatch(/node/i);
    expect(scriptContent).toMatch(/20/);
  });

  it('should use HTTPS for all URLs', () => {
    const httpUrls = scriptContent.match(/http:\/\//g);
    expect(httpUrls).toBeNull();
    expect(scriptContent).toMatch(/https:\/\//);
  });

  it('should verify checksums', () => {
    expect(scriptContent).toMatch(/sha256sum|shasum/);
  });

  it('should set executable permissions', () => {
    expect(scriptContent).toMatch(/chmod\s+\+x/);
  });

  it('should reference the correct GitHub repo', () => {
    expect(scriptContent).toContain('yasha-dev1/codefactory');
  });

  it('should handle CODEFACTORY_INSTALL_DIR env var', () => {
    expect(scriptContent).toContain('CODEFACTORY_INSTALL_DIR');
  });

  it('should be under 200 lines', () => {
    expect(scriptLines.length).toBeLessThan(200);
  });
});
