# Nebius model integration

Demeter's scenario presets and engineering engine run locally. The planned model adapter will turn natural-language requests into validated scene edits, then call the existing solver.

## Standalone tool-call check

`scripts/nebius_smoke.py` exercises a two-request tool-call round trip with Nebius Token Factory. It uses Python's standard library and a synthetic constraint update.

1. Copy `.env.example` to `.env`.
2. Set `NEBIUS_API_KEY` and `NEBIUS_MODEL` to your API key and an available `nvidia/` model ID.
3. Run:

```sh
python scripts/nebius_smoke.py
```

The script requests a budget of CNY 8,000 with terraces T4 and T5 retained. It validates the exact tool name and arguments, applies the synthetic update locally, and submits the tool result for a final response. Each request has a 1,024-token output limit and a 60-second timeout. Running it uses the configured provider account.

The output reports validation results, latency, token usage and the model response. The script is independent of the application and does not run a hydraulic solve.

## Adapter design

- Keep model credentials on the server.
- Convert tool arguments to typed scene patches.
- Validate geometry and constraints before scheduling a run.
- Use solver results as the source for the model's explanation.
- Record model usage alongside the scene revision and run ID.

References: [Function calling](https://docs.tokenfactory.nebius.com/ai-models-inference/function-calling) · [Structured output](https://docs.tokenfactory.nebius.com/ai-models-inference/json).
