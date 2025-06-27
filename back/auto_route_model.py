import subprocess
import logging
import json

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s",
    filename="server.log",
    filemode="a"
)

ALLOWED_DOMAINS = ["legal", "science", "insurance", "math", "technology", "code"]

def detect_domain(user_query: str, model_name="llama3") -> str:
    """
    Calls a local LLM using Ollama to determine the domain area for the given query.
    """

    # Build comma-separated domain list for the prompt
    domains_str = ", ".join(ALLOWED_DOMAINS)

    prompt = (
        f"""
For the query below, classify it into ONE domain ONLY from this list: {domains_str}.
Return ONLY a JSON object like:
{{"domain": "<domain>"}}
If unsure, default to "general".

Query:
\"\"\"
{user_query}
\"\"\"
"""
    )

    logging.info(f"Using {model_name} to get domain for the query with timeout:30")

    try:
        result = subprocess.run(
            ["ollama", "run", model_name, prompt],
            capture_output=True,
            text=True,
            timeout=30,
        )

        raw_output = result.stdout.strip()
        logging.info(f"{model_name} raw output: {raw_output}")

        try:
            parsed = json.loads(raw_output)
            domain = parsed.get("domain", "").lower().strip()
            if domain in ALLOWED_DOMAINS:
                return domain
            logging.warning(f"Domain '{domain}' not in allowed list, defaulting to 'general'")
            return "general"
        except json.JSONDecodeError:
            logging.error("Failed to parse JSON output. Falling back to 'general'.")
            return "general"

    except subprocess.TimeoutExpired:
        logging.error("Ollama call timed out. Falling back to 'general'.")
        return "general"

    except Exception as e:
        logging.exception("Unexpected error during domain detection.")
        return "general"
