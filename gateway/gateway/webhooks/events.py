"""Pydantic models for GitHub webhook event payloads."""

from __future__ import annotations

from pydantic import BaseModel


class GitHubUser(BaseModel):
    login: str
    type: str = "User"


class GitHubRepository(BaseModel):
    full_name: str
    clone_url: str
    default_branch: str = "main"


class GitHubLabel(BaseModel):
    name: str


class GitHubIssue(BaseModel):
    number: int
    title: str
    body: str | None = None
    user: GitHubUser
    labels: list[GitHubLabel] = []
    state: str = "open"


class GitHubPullRequest(BaseModel):
    number: int
    title: str
    body: str | None = None
    user: GitHubUser
    head: dict
    base: dict
    state: str = "open"


class IssueEvent(BaseModel):
    action: str
    issue: GitHubIssue
    repository: GitHubRepository
    label: GitHubLabel | None = None


class PullRequestEvent(BaseModel):
    action: str
    pull_request: GitHubPullRequest
    repository: GitHubRepository


class PushEvent(BaseModel):
    ref: str
    repository: GitHubRepository
    commits: list[dict] = []


WebhookPayload = IssueEvent | PullRequestEvent | PushEvent
