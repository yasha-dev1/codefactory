export interface TerminalLinkOptions {
  forceHyperlink?: boolean;
}

function hyperlinksEnabled(forceHyperlink?: boolean): boolean {
  if (forceHyperlink === true) return true;
  if (forceHyperlink === false) return false;

  const env = process.env;
  if (env.FORCE_HYPERLINK === '0' || env.FORCE_HYPERLINK === 'false') return false;
  if (env.FORCE_HYPERLINK !== undefined && env.FORCE_HYPERLINK !== '') return true;
  if (env.NO_COLOR !== undefined) return false;
  if (env.TERM === 'dumb') return false;
  if (env.CI) return false;

  return Boolean(process.stdout && process.stdout.isTTY);
}

export function terminalLink(
  label: string,
  url: string,
  options: TerminalLinkOptions = {},
): string {
  if (!hyperlinksEnabled(options.forceHyperlink)) {
    return label === url ? url : `${label} (${url})`;
  }

  const ESC = '\x1b';
  const ST = `${ESC}\\`;
  return `${ESC}]8;;${url}${ST}${label}${ESC}]8;;${ST}`;
}
