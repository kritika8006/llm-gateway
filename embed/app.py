from fastapi import FastAPI
from pydantic import BaseModel
from fastembed import TextEmbedding

app = FastAPI()
model = TextEmbedding("sentence-transformers/all-MiniLM-L6-v2", cache_dir="/models")


class One(BaseModel):
    text: str


class Many(BaseModel):
    texts: list[str]


@app.post("/embed")
def embed(r: One):
    return {"vector": next(iter(model.embed([r.text]))).tolist()}


@app.post("/embed_batch")
def embed_batch(r: Many):
    return {"vectors": [v.tolist() for v in model.embed(r.texts)]}


@app.get("/health")
def health():
    return {"ok": True}