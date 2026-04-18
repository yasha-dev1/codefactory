import { homedir } from 'node:os';
import { join } from 'node:path';

export const APP_NAME = 'harnext';
export const VERSION = '0.1.0';
export const CONFIG_DIR_NAME = '.harnext';

export function getAgentDir(): string {
  return process.env.HARNEXT_AGENT_DIR ?? join(homedir(), CONFIG_DIR_NAME, 'agent');
}

export function getSessionsDir(): string {
  return join(getAgentDir(), 'sessions');
}

export function getProjectSkillsDir(cwd: string = process.cwd()): string {
  return join(cwd, CONFIG_DIR_NAME, 'skills');
}
