import { confirm, select, checkbox, input } from '@inquirer/prompts';

export async function confirmPrompt(message: string, defaultValue = true): Promise<boolean> {
  return confirm({ message, default: defaultValue });
}

export async function selectPrompt<T>(
  message: string,
  choices: { name: string; value: T }[],
): Promise<T> {
  return select({ message, choices });
}

export async function multiselectPrompt<T>(
  message: string,
  choices: { name: string; value: T; checked?: boolean }[],
): Promise<T[]> {
  return checkbox({ message, choices });
}

export async function inputPrompt(message: string, defaultValue?: string): Promise<string> {
  return input({ message, default: defaultValue });
}
