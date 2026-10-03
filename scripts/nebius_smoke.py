"""Minimal Token Factory tool-call check using only Python's standard library.

Uses two bounded requests and a local synthetic constraint update, not a solver.
Requires NEBIUS_API_KEY and NEBIUS_MODEL in the environment or workspace .env.
"""

import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
ENDPOINT = "https://api.tokenfactory.nebius.com/v1/chat/completions"


def configuration():
    values = {}
    env_file = ROOT / ".env"
    if env_file.exists():
        for raw in env_file.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            if name in {"NEBIUS_API_KEY", "NEBIUS_MODEL"}:
                values[name] = value.strip().strip("\"'")
    for name in ("NEBIUS_API_KEY", "NEBIUS_MODEL"):
        values[name] = os.environ.get(name) or values.get(name, "")
        if not values[name]:
            raise ValueError(f"Missing {name}; set it in local .env or environment")
    if not values["NEBIUS_MODEL"].lower().startswith("nvidia/"):
        raise ValueError("Choose a verified NVIDIA model ID for this project")
    return values


def request_completion(config, messages, tools=None):
    payload = {
        "model": config["NEBIUS_MODEL"],
        "messages": messages,
        "max_tokens": 1024,
        "temperature": 0,
    }
    if tools:
        payload.update(tools=tools, tool_choice="auto")
    request = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": "Bearer " + config["NEBIUS_API_KEY"],
            "Content-Type": "application/json",
        },
        method="POST",
    )
    started = time.monotonic()
    # Do not follow redirects with a credential-bearing request.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    opener = urllib.request.build_opener(NoRedirect)
    with opener.open(request, timeout=60) as response:
        result = json.load(response)
    return result, round(time.monotonic() - started, 3)


def main():
    config = configuration()
    tools = [{
        "type": "function",
        "function": {
            "name": "update_design_constraints",
            "description": "Update synthetic orchard design constraints. No hydraulic solve is performed.",
            "parameters": {
                "type": "object",
                "properties": {
                    "budget_cny": {"type": "integer"},
                    "preserve_terrace_ids": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["budget_cny", "preserve_terrace_ids"],
                "additionalProperties": False,
            },
        },
    }]
    messages = [
        {"role": "system", "content": "You help edit a synthetic orchard design. Use the provided tool for changes. Do not invent hydraulic results or change any other constraints."},
        {"role": "user", "content": "Set the budget to CNY 8000 and keep only the upper terraces T4 and T5. Use the tool to update the plan."},
    ]
    first, elapsed1 = request_completion(config, messages, tools)
    first_choice = first["choices"][0]
    calls = first_choice["message"].get("tool_calls", [])
    if first_choice.get("finish_reason") == "length" or len(calls) != 1:
        raise ValueError("Expected one complete tool call; response did not pass")
    call = calls[0]
    if call["function"]["name"] != "update_design_constraints":
        raise ValueError("Unexpected function; nothing executed")
    arguments = json.loads(call["function"]["arguments"])
    expected = {"budget_cny": 8000, "preserve_terrace_ids": ["T4", "T5"]}
    if arguments != expected or type(arguments.get("budget_cny")) is not int:
        raise ValueError("Arguments differ from the explicit user request; nothing executed")
    tool_result = {"status": "updated", "constraints": expected, "hydraulic_status": "not_run"}
    messages.extend([
        {"role": "assistant", "content": first_choice["message"].get("content"), "tool_calls": calls},
        {"role": "tool", "tool_call_id": call["id"], "content": json.dumps(tool_result)},
    ])
    second, elapsed2 = request_completion(config, messages)
    final_choice = second["choices"][0]
    if final_choice.get("finish_reason") == "length" or not final_choice["message"].get("content"):
        raise ValueError("Tool result round trip did not produce a complete answer")
    report = {
        "model": config["NEBIUS_MODEL"],
        "endpoint": ENDPOINT,
        "tool_arguments_passed": True,
        "tool_result_roundtrip_passed": True,
        "latency_seconds": [elapsed1, elapsed2],
        "usage": [first.get("usage"), second.get("usage")],
        "arguments": arguments,
        "answer": final_choice["message"]["content"],
        "scope": "One synthetic tool-call case; no solver or broader accuracy evaluation.",
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as exc:
        # Never print request headers, credentials, or an untrusted server body.
        print(f"Token Factory HTTP {exc.code}; no automatic retry", file=sys.stderr)
        sys.exit(1)
    except (ValueError, KeyError, IndexError, urllib.error.URLError, TimeoutError) as exc:
        print(f"Check failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
