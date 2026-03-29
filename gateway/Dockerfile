FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir poetry

COPY pyproject.toml poetry.lock ./
RUN poetry config virtualenvs.create false \
    && poetry install --no-interaction --no-ansi

COPY gateway/ gateway/

EXPOSE 8585

CMD ["uvicorn", "gateway.main:app", "--host", "0.0.0.0", "--port", "8585"]
