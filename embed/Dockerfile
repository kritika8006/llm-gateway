FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir fastembed fastapi "uvicorn[standard]"
# bake the model into the image so startup needs no download
RUN python -c "from fastembed import TextEmbedding; TextEmbedding('sentence-transformers/all-MiniLM-L6-v2', cache_dir='/models')"
COPY app.py .
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]