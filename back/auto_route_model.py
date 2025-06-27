# auto_route_model.py

import subprocess
import logging

logging.basicConfig(
  level=logging.INFO,
  format="%(asctime)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s",
  filename="server.log",   # Logs will go to this file
  filemode="a"                    # "a" to append, "w" to overwrite on each run
)

def detect_domain(user_query: str, model_name="llama3") -> str:
  """
  Calls a local LLM using Ollama to determine the domain area for the given query.
  """

  prompt = (
    f"For the query: \"{user_query}\", give me one word domain area where the user query belongs to. "
    "Domain can be within: (legal, science, insurance, math). "
    "If it does not belong to any of the given then assume domain to be general."
  )
  logging.info(f"Using {model_name} to get domain for the query with timeout:30")
  try:
    result = subprocess.run(
      ["ollama", "run", model_name, prompt],
      capture_output=True,
      text=True,
      timeout=30,
    )

    output = result.stdout.strip().lower()
    logging.info(f"{model_name} output: {output}")
    # Basic sanitation
    for domain in ["legal", "science", "insurance", "math"]:
      if domain in output:
        return domain
    return "general"
  except Exception as e:
    return "general"
