export class UserCancelledError extends Error {
  constructor(message = 'Operation cancelled by user') {
    super(message);
    this.name = 'UserCancelledError';
  }
}

export class ClaudeNotFoundError extends Error {
  constructor(message = 'Claude CLI not found. Please install Claude Code: npm install -g @anthropic-ai/claude-code') {
    super(message);
    this.name = 'ClaudeNotFoundError';
  }
}

export class NotAGitRepoError extends Error {
  constructor(message = 'Not a git repository. Please run this command from within a git repo.') {
    super(message);
    this.name = 'NotAGitRepoError';
  }
}

export class WorktreeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorktreeError';
  }
}
