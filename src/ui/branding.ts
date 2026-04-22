import chalk from 'chalk';

const FLOWHUNT_URL = 'https://www.flowhunt.io';

function supportsHyperlinks(): boolean {
  if (!process.stdout.isTTY) return false;

  const term = process.env.TERM ?? '';
  if (term === 'dumb') return false;

  const termProgram = process.env.TERM_PROGRAM ?? '';
  if (
    termProgram === 'iTerm.app' ||
    termProgram === 'WezTerm' ||
    termProgram === 'ghostty' ||
    termProgram === 'vscode'
  ) {
    return true;
  }

  if (process.env.VTE_VERSION) return true;
  if (process.env.KITTY_WINDOW_ID) return true;
  if (process.env.WT_SESSION) return true;

  return false;
}

export function hyperlink(url: string, label: string): string {
  if (!supportsHyperlinks()) return label === url ? url : `${label} (${url})`;
  return `\x1b]8;;${url}\x07${label}\x1b]8;;\x07`;
}

export function renderFlowHuntBranding(): string {
  const name = chalk.bold('FlowHunt');
  const tagline = chalk.dim(' — powered by flowhunt · ');
  const link = chalk.dim(hyperlink(FLOWHUNT_URL, FLOWHUNT_URL));
  return `${name}${tagline}${link}`;
}

export function printFlowHuntBranding(): void {
  console.log(renderFlowHuntBranding());
}
