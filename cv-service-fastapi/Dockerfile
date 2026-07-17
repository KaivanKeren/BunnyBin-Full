FROM python:3.11-slim
WORKDIR /app

# INSTALL_REAL=true -> pasang juga dependency real mode (ultralytics, opencv).
# Default false supaya image dummy tetap ringan.
ARG INSTALL_REAL=false

COPY requirements.txt requirements-real.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && if [ "$INSTALL_REAL" = "true" ]; then \
         apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
         && rm -rf /var/lib/apt/lists/* \
         && pip install --no-cache-dir -r requirements-real.txt; \
       fi

COPY app/ ./app
EXPOSE 8000
HEALTHCHECK CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
