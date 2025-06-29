import logging
import os
import json
import requests  # <-- Added for API-based call
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import OllamaEmbeddings
import re
import difflib

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s",
    filename="server.log",
    filemode="a"
)

ALLOWED_DOMAINS = ["legal", "science", "insurance", "math", "code"]

VECTOR_DIR = "rag_store"
VECTOR_PATH = os.path.join(VECTOR_DIR, "faiss_index")
vector_store = None

if os.path.exists(VECTOR_PATH):
  vector_store = FAISS.load_local(VECTOR_PATH, OllamaEmbeddings(model="nomic-embed-text"), allow_dangerous_deserialization=True)

def detect_domain(user_query: str, model_name="gemma3:1b", useRag=False, available_models=['gemma3:1b'], available_domains=ALLOWED_DOMAINS) -> str:
    """
    Calls a local LLM using Ollama to determine the domain area for the given query.
    """

    # Build comma-separated domain list for the prompt
    domains_str = ", ".join(available_domains)
    models_str = ", ".join(available_models)
    
    custom_prompt = f"Classify the query into one of the given domains: {domains_str}. Tell whether the query is logical or memory based. Limit the response within 50 words\nquery: {user_query}"
    try:
        url = "http://localhost:11434/api/generate"
        response = requests.post(
            url,
            json={
                "model": model_name,
                "prompt": custom_prompt,
                "stream": False
            },
            timeout=30,
        )
        response.raise_for_status()
        # Ollama returns the result in the "response" field in JSON
        query_domain_details = response.json().get("response", "")
        logging.info(f"{model_name} API raw output: {query_domain_details}")
    except Exception as e:
        logging.exception("Unexpected error during domain detection.")
        return e

    prompt_with_context = user_query
    custom_query = f"Query metadata: {query_domain_details}, query: {user_query}"
    if useRag and vector_store:
            docs = vector_store.similarity_search(custom_query, k=4)
            context = "\n\n".join([doc.page_content for doc in docs])
            prompt_with_context = (
                f"Use the following context to answer accurately:\n\n{context}\n\n"
                f"Question: {user_query}"
            )
            logging.info(f"RAG context included in prompt. Context preview: {context[:300]}")

    prompt = (
    f"""
    I will give you some context and the Question in the Query.
    And based given context find the best fit model (from the given available model list) to use for the below Question: 
    available model list: {models_str}.
    Return ONLY a valid JSON object **without any markdown formatting or code block wrappers** like triple backticks.
    example json:
    {{"model": "model_name" }}
    model_name should strictly be one of the given available model list

    Query:
    \"\"\"
    {prompt_with_context}
    \"\"\"
    """
)

    logging.info(f"Using {model_name} to get domain for the query with timeout:30")

    try:
        url = "http://localhost:11434/api/generate"
        response = requests.post(
            url,
            json={
                "model": model_name,
                "prompt": prompt,
                "stream": False
            },
            timeout=30,
        )
        response.raise_for_status()
        # Ollama returns the result in the "response" field in JSON
        raw_output = response.json().get("response", "").replace("\n", "").strip()
        logging.info(f"{model_name} API raw output: {raw_output}")

        try:
            # Remove ```json ... ``` wrappers if present
            if raw_output.startswith("```"):
                raw_output = re.sub(r"^```(?:json)?", "", raw_output)
                raw_output = raw_output.rstrip("`").strip()

            parsed = json.loads(raw_output)
            model = parsed.get("model", "gemma3:1b").strip()
            logging.info(f"parsed model: {model}")

            if model not in available_models:
                closest = difflib.get_close_matches(model, available_models, n=2, cutoff=0.4)
                if closest == []:
                    model = "gemma3:1b"
                model = closest[0]
                logging.info(f"closest: {closest}, model: {model}")


            return {
                "model": model
            }

        except json.JSONDecodeError:
            logging.error("Failed to parse JSON output. Falling back to default.")
            return {
                "model": "gemma3"
            }

    except requests.Timeout:
        logging.error("Ollama API call timed out. Falling back to 'general'.")
        return "general"

    except Exception as e:
        logging.exception("Unexpected error during domain detection.")
        return "general"