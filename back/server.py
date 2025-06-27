"""demo"""

import subprocess
import logging
import os, shutil
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi import UploadFile, File, FastAPI
from fastapi.requests import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from langchain.vectorstores import FAISS
from langchain.embeddings import OllamaEmbeddings
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.document_loaders import PyPDFLoader, UnstructuredFileLoader
from auto_route_model import detect_domain 

logging.basicConfig(
  level=logging.INFO,
  format="%(asctime)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s",
  filename="server.log",   # Logs will go to this file
  filemode="a"                    # "a" to append, "w" to overwrite on each run
)

app = FastAPI()

@app.middleware("http")
async def log_requests(request: Request, call_next):
  logging.info(f"Incoming request: {request.method} {request.url}")
  return await call_next(request)

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

class Query(BaseModel):
  """for endpoint validations"""
  query: str
  model: str  # Model name sent from frontend (e.g., "llama3", "mistral", etc.)
  useRag: bool = False

class Pull(BaseModel):
  model_name: str

UPLOAD_DIR = "uploads"
VECTOR_DIR = "rag_store"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(VECTOR_DIR, exist_ok=True)

VECTOR_PATH = os.path.join(VECTOR_DIR, "faiss_index")
vector_store = None

# Load existing vector store if it exists
if os.path.exists(VECTOR_PATH):
  vector_store = FAISS.load_local(VECTOR_PATH, OllamaEmbeddings(model="nomic-embed-text"), allow_dangerous_deserialization=True)

@app.get("/uploaded-files")
def list_uploaded_files():
  try:
    files = os.listdir(UPLOAD_DIR)
    return JSONResponse({"files": files})
  except Exception as e:
    logging.error(f"Error listing uploaded files: {e}")
    return JSONResponse({"files": [], "error": str(e)})
  
@app.post("/upload")
async def upload_files(files: list[UploadFile] = File(...)):
  global vector_store
  saved_files = []

  for file in files:
    path = os.path.join(UPLOAD_DIR, file.filename)
    with open(path, "wb") as f:
      shutil.copyfileobj(file.file, f)
    saved_files.append(file.filename)

    # --- Load and index ---
    if file.filename.endswith(".pdf"):
      loader = PyPDFLoader(path)
    else:
      loader = UnstructuredFileLoader(path)

    docs = loader.load()

    # Chunking
    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=100)
    chunks = splitter.split_documents(docs)

    # Embedding model
    embeddings = OllamaEmbeddings(model="nomic-embed-text")

    # Vector store creation or addition
    if vector_store is None:
      vector_store = FAISS.from_documents(chunks, embeddings)
    else:
      vector_store.add_documents(chunks)

  # Save vector store
  vector_store.save_local(VECTOR_PATH)

  return {"success": True, "files": saved_files}

@app.post("/pull")
def pull_model(req: Pull):
  logging.info(f"Received /pull payload: {req}")
  logging.info(f"/pull Pulling model timeout: 300")
  try:
    result = subprocess.run(
      ["ollama", "pull", req.model_name],
      capture_output=True,
      text=True,
      timeout=300
    )
    if result.returncode == 0:
      return_val = {"success": True}
    else:
      return_val = {"success": False, "error": result.stderr.strip()}
    logging.info(f"/pull Returning: {return_val}")
    return return_val
  except Exception as e:
    logging.error(f"/pull exception: {e}")
    return {"success": False, "error": str(e)}

@app.get("/models")
def list_models():
  logging.info(f"/models getting model list")
  try:
    result = subprocess.run(
      ["ollama", "list"],
      capture_output=True,
      text=True,
      timeout=10
    )
    lines = result.stdout.strip().split("\n")[1:]  # skip header
    models = [line.split()[0] for line in lines]
    logging.info(f"/models returning models list: {models}")
    return {"models": models}
  except Exception as e:
    logging.error(f"/models exception: {e}")
    return {"models": [], "error": str(e)}

@app.post("/qa")
async def qa(q: Query):
  logging.info(f"Received /qa payload: {q}")
  try:
    model_to_use = q.model
    logging.info(f"/qa query: {q.query}, model: {q.model}, useRag: {q.useRag}")
    if q.model == "auto":
      domain = detect_domain(q.query)
      logging.info(f"detect_domain model output: {domain}")
      model_mapping = {
        "legal": "mistral",
        "science": "phi",
        "insurance": "mistral",
        "math": "phi",
        "general": "llama3"
      }
      model_to_use = model_mapping.get(domain, "llama3")
      logging.info(f"mapped model: {model_to_use}")

    prompt = q.query
    if q.useRag and vector_store:
      docs = vector_store.similarity_search(q.query, k=4)
      context = "\n\n".join([doc.page_content for doc in docs])
      prompt = f"Use the following context to answer the question:\n\n{context}\n\nQuestion: {q.query}"
      logging.info(f"RAG context included in prompt. Context preview: {context[:300]}")

    def generate():
      logging.info(f"Running user query: {prompt} on model {model_to_use}")
      try:
        process = subprocess.Popen(
          ["ollama", "run", model_to_use, prompt],
          stdout=subprocess.PIPE,
          stderr=subprocess.PIPE,
          text=True,
          bufsize=1
        )
        for line in process.stdout:
          yield line
      except Exception as e:
        logging.error(f"Streaming error: {e}")
        yield f"Error running model: {str(e)}"

    return StreamingResponse(generate(), media_type="text/plain", headers={"X-Model-Used": model_to_use})

  except Exception as e:
    logging.error(f"Exception in /qa: {e}")
    return StreamingResponse(
      iter([f"Error running model: {str(e)}"]),
      media_type="text/plain",
      headers={"X-Model-Used": q.model}
    )
