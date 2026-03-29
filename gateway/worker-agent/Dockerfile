FROM python:3.11-slim

WORKDIR /app

RUN pip install poetry && poetry config virtualenvs.create false

COPY pyproject.toml ./
RUN poetry install --no-root --only main

COPY worker_agent/ ./worker_agent/

ENTRYPOINT ["python", "-m", "worker_agent.main"]
