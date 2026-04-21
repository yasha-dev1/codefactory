import chalk from 'chalk';

import { terminalLink } from '../utils/terminal-link.js';
import type { TerminalLinkOptions } from '../utils/terminal-link.js';

export const FLOWHUNT_URL = 'https://www.flowhunt.io';

export function renderFlowHuntBranding(options: TerminalLinkOptions = {}): string {
  const name = chalk.bold('FlowHunt');
  const tagline = chalk.dim(' — powered by flowhunt · ');
  const link = chalk.dim(terminalLink(FLOWHUNT_URL, FLOWHUNT_URL, options));
  return `${name}${tagline}${link}`;
}

let printed = false;

export function printBrandingOnce(): void {
  if (printed) return;
  printed = true;
  console.log(renderFlowHuntBranding());
}

export function __resetBrandingForTests(): void {
  printed = false;
}
