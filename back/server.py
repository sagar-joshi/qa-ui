"""demo"""

import subprocess
import logging
import os, shutil
from fastapi import FastAPI, Body, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.requests import Request
from pydantic import BaseModel
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import OllamaEmbeddings
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader, UnstructuredFileLoader
from auto_route_model import detect_domain
import re
import time
import requests  # <-- Added for Ollama API calls

def rebuild_vector_store():
    """
    Rebuilds the FAISS vector store from all files in the uploads folder.
    Updates both disk and in-memory vector_store reference.
    """
    global vector_store

    embeddings = OllamaEmbeddings(model="nomic-embed-text")
    new_vector_store = None

    for fname in os.listdir(UPLOAD_DIR):
        path = os.path.join(UPLOAD_DIR, fname)
        if fname.endswith(".pdf"):
            loader = PyPDFLoader(path)
        else:
            loader = UnstructuredFileLoader(path)

        docs = loader.load()
        splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=100)
        chunks = splitter.split_documents(docs)

        if new_vector_store is None:
            new_vector_store = FAISS.from_documents(chunks, embeddings)
        else:
            new_vector_store.add_documents(chunks)

    # Save or clear the vector store
    if new_vector_store:
        new_vector_store.save_local(VECTOR_PATH)
        vector_store = new_vector_store
        logging.info("✅ Vector store rebuilt and saved successfully.")
    else:
        if os.path.exists(VECTOR_PATH):
            shutil.rmtree(VECTOR_PATH)
        vector_store = None
        logging.info("⚠️ No files left — vector store cleared.")

# --- Logging ---
logging.basicConfig(
  level=logging.INFO,
  format="%(asctime)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s",
  filename="server.log",
  filemode="a"
)

# --- FastAPI app ---
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
  expose_headers=["X-Model-Used"]
)

# --- Models we expect ---
REQUIRED_MODELS = {"llama3", "mistral", "phi", "nomic-embed-text", "codellama"}

# --- Model check and auto-pull ---
def ensure_models_present():
  try:
    logging.info("Checking which models are already installed...")
    result = subprocess.run(
      ["ollama", "list"],
      capture_output=True,
      text=True,
      timeout=10
    )
    installed = {line.split()[0].split(":")[0] for line in result.stdout.strip().split("\n")[1:]}
    missing = REQUIRED_MODELS - installed

    if missing:
      logging.info(f"Missing models detected: {missing}. Pulling them now...")
      for model in missing:
        pull = subprocess.run(
          ["ollama", "pull", model],
          capture_output=True,
          text=True,
          timeout=300
        )
        if pull.returncode == 0:
          logging.info(f"✅ Successfully pulled model: {model}")
        else:
          logging.error(f"❌ Failed to pull model {model}: {pull.stderr.strip()}")
    else:
      logging.info("✅ All required models are already present.")
  except Exception as e:
    logging.error(f"Error checking/pulling models: {e}")

# Run model check before anything else
ensure_models_present()

# --- Pydantic schemas ---
class Query(BaseModel):
  query: str
  model: str
  useRag: bool = False

class Pull(BaseModel):
  model_name: str

# --- Directories ---
UPLOAD_DIR = "uploads"
VECTOR_DIR = "rag_store"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(VECTOR_DIR, exist_ok=True)

VECTOR_PATH = os.path.join(VECTOR_DIR, "faiss_index")
vector_store = None

# --- Load existing vector store if it exists ---
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
    saved_files = []
    for file in files:
        path = os.path.join(UPLOAD_DIR, file.filename)
        with open(path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        saved_files.append(file.filename)

    rebuild_vector_store()
    return {"success": True, "files": saved_files}

@app.post("/pull")
def pull_model(req: Pull):
    logging.info(f"Received /pull payload: {req.model_name}")
    
    def event_stream():
        try:
            process = subprocess.Popen(
                ["ollama", "pull", req.model_name],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1
            )

            for line in iter(process.stdout.readline, ''):
                if line:
                    logging.info(f"[PULL_PROGRESS] {line.strip()}")
                    yield line
                    # Optional: flush delay to mimic stream pacing (remove in prod if needed)
                    time.sleep(0.05)

            process.stdout.close()
            return_code = process.wait()

            if return_code == 0:
                yield "100% - Pull completed successfully.\n"
            else:
                yield f"Error: Model pull failed with code {return_code}\n"

        except Exception as e:
            logging.error(f"Exception in /pull stream: {e}")
            yield f"Error: {str(e)}\n"

    return StreamingResponse(event_stream(), media_type="text/plain")

@app.get("/models")
def list_models():
  try:
    result = subprocess.run(
      ["ollama", "list"],
      capture_output=True,
      text=True,
      timeout=10
    )
    lines = result.stdout.strip().split("\n")[1:]
    models = [line.split()[0] for line in lines]
    return {"models": models}
  except Exception as e:
    logging.error(f"/models exception: {e}")
    return {"models": [], "error": str(e)}

@app.post("/qa")
async def qa(q: Query):
    logging.info(f"Received /qa payload: {q}")
    try:
        # Default model selection
        model_to_use = q.model
        query_lower = q.query.lower()

        # Auto routing
        if q.model == "auto":
            domain = detect_domain(q.query)
            logging.info(f"detect_domain model output: {domain}")

            # Basic keyword override for code
            if any(kw in query_lower for kw in ["code", "function", "class", "def", "import", "script"]):
                domain = "code"

            # Best-fit mapping
            model_mapping = {
                "legal": "mistral",
                "science": "phi",
                "insurance": "mistral",
                "math": "phi",
                "code": "codellama",
                "general": "llama3"
            }
            model_to_use = model_mapping.get(domain, "llama3")
            logging.info(f"Mapped model: {model_to_use}")

        # Context enrichment with RAG if enabled
        prompt_with_context = q.query
        if q.useRag and vector_store:
            docs = vector_store.similarity_search(q.query, k=4)
            context = "\n\n".join([doc.page_content for doc in docs])
            prompt_with_context = (
                f"Use the following context to answer accurately:\n\n{context}\n\n"
                f"Question: {q.query}"
            )
            logging.info(f"RAG context included in prompt. Context preview: {context[:300]}")

        # Prompt formatting per model
        if model_to_use == "codellama":
            prompt = (
              "You are a professional coding assistant.\n"
              "Generate clear, production-quality code for the following request.\n"
              "Respect the language and technology the user requests.\n"
              "IMPORTANT:\n"
              "- Output ONLY the code, without any markdown formatting.\n"
              "- Do NOT include any explanations or introductions.\n"
              "- Do NOT wrap the code in code fences.\n"
              "- If the user did not specify a language, choose the most appropriate one.\n\n"
              f"{prompt_with_context}"
            )
        elif model_to_use in ["mistral", "llama3"]:
            prompt = (
            f"You are an expert assistant.\n"
            f"Provide a clear, concise answer for the following query.\n"
            f"If the answer is code, output ONLY the raw code without markdown.\n\n"
            f"Query:\n"
            f"{prompt_with_context}\n\n"
            f"Output only the answer."
            )
        elif model_to_use == "phi":
            prompt = (
            f"You are a domain expert.\n"
            f"Give a detailed, step-by-step answer to the following question.\n"
            f"If the answer includes code, output ONLY the code without markdown formatting.\n\n"
            f"Question:\n"
            f"{prompt_with_context}\n\n"
            f"Output only the answer."
            )
        else:
           prompt = prompt_with_context

        # --- PATCH: Use Ollama API for generation instead of subprocess ---
        def generate():
            logging.info(f"Running user query on model: {model_to_use} via Ollama API")
            url = "http://localhost:11434/api/generate"
            try:
                response = requests.post(
                    url,
                    json={
                        "model": model_to_use,
                        "prompt": prompt,
                        "stream": True
                    },
                    stream=True,
                    timeout=300
                )
                for line in response.iter_lines(decode_unicode=True):
                    if line:
                        try:
                            import json
                            data = json.loads(line)
                            text = data.get("response", "")
                            yield text
                        except Exception:
                            yield line + "\n"
            except Exception as e:
                logging.error(f"Exception in /qa Ollama API stream: {e}")
                yield f"Error: {str(e)}\n"
        # --- END PATCH ---

        return StreamingResponse(
            generate(),
            media_type="text/plain",
            headers={"X-Model-Used": model_to_use}
        )

    except Exception as e:
        logging.error(f"Exception in /qa: {e}")
        return StreamingResponse(
            iter([f"Error running model: {str(e)}"]),
            media_type="text/plain",
            headers={"X-Model-Used": q.model}
        )

@app.post("/delete-file")
async def delete_file(payload: dict = Body(...)):
    filename = payload.get("filename")
    if not filename:
        return {"success": False, "error": "Filename not provided."}

    file_path = os.path.join(UPLOAD_DIR, filename)
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            logging.info(f"🗑️ Deleted file: {file_path}")
        else:
            return {"success": False, "error": "File does not exist."}

        rebuild_vector_store()

        return {"success": True}

    except Exception as e:
        logging.error(f"❌ Error deleting file {filename} and rebuilding vector store: {e}")
        return {"success": False, "error": str(e)}