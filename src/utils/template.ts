import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesDir = resolve(__dirname, '../../templates');

export async function loadTemplate(name: string): Promise<string> {
  const path = resolve(templatesDir, name);
  return readFile(path, 'utf-8');
}

export function renderTemplate(
  template: string,
  vars: Record<string, string | string[] | boolean | undefined>,
): string {
  let result = template;

  // Process {{#each var}}...{{/each}} blocks
  result = result.replace(
    /\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_match, key: string, body: string) => {
      const value = vars[key];
      if (!Array.isArray(value) || value.length === 0) return '';
      return value.map((item) => body.replace(/\{\{this\}\}/g, item)).join('');
    },
  );

  // Process {{#if var}}...{{else}}...{{/if}} blocks
  result = result.replace(
    /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, key: string, body: string) => {
      const value = vars[key];
      const isTruthy =
        value !== undefined &&
        value !== false &&
        value !== '' &&
        !(Array.isArray(value) && value.length === 0);

      // Split on {{else}} if present
      const elseParts = body.split(/\{\{else\}\}/);
      if (isTruthy) {
        return elseParts[0];
      }
      return elseParts[1] ?? '';
    },
  );

  // Process simple {{var}} replacements
  result = result.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = vars[key];
    if (value === undefined) return match;
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'boolean') return String(value);
    return value;
  });

  return result;
}
