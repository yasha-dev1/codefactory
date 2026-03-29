"""Tests for GitHub webhook event model parsing."""

from gateway.webhooks.events import IssueEvent, PullRequestEvent, PushEvent


def test_issue_event_parses():
    data = {
        "action": "opened",
        "issue": {
            "number": 42,
            "title": "Bug report",
            "body": "Something broke",
            "user": {"login": "testuser", "type": "User"},
            "labels": [{"name": "bug"}],
            "state": "open",
        },
        "repository": {
            "full_name": "org/repo",
            "clone_url": "https://github.com/org/repo.git",
            "default_branch": "main",
        },
    }
    event = IssueEvent(**data)
    assert event.action == "opened"
    assert event.issue.number == 42
    assert event.issue.labels[0].name == "bug"
    assert event.repository.full_name == "org/repo"


def test_pull_request_event_parses():
    data = {
        "action": "opened",
        "pull_request": {
            "number": 10,
            "title": "Fix bug",
            "body": None,
            "user": {"login": "dev"},
            "head": {"ref": "fix/bug", "sha": "abc123"},
            "base": {"ref": "main", "sha": "def456"},
            "state": "open",
        },
        "repository": {
            "full_name": "org/repo",
            "clone_url": "https://github.com/org/repo.git",
        },
    }
    event = PullRequestEvent(**data)
    assert event.pull_request.number == 10
    assert event.pull_request.head["ref"] == "fix/bug"


def test_push_event_parses():
    data = {
        "ref": "refs/heads/main",
        "repository": {
            "full_name": "org/repo",
            "clone_url": "https://github.com/org/repo.git",
        },
        "commits": [{"id": "abc", "message": "fix"}],
    }
    event = PushEvent(**data)
    assert event.ref == "refs/heads/main"
    assert len(event.commits) == 1


def test_issue_event_with_label():
    data = {
        "action": "labeled",
        "issue": {
            "number": 1,
            "title": "Test",
            "user": {"login": "bot"},
            "state": "open",
        },
        "repository": {
            "full_name": "org/repo",
            "clone_url": "https://github.com/org/repo.git",
        },
        "label": {"name": "agent:plan"},
    }
    event = IssueEvent(**data)
    assert event.label is not None
    assert event.label.name == "agent:plan"
