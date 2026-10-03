# Nebius model integration

Demeter's editable prompt calls a server-side planner. The local simulator and Nebius adapter use the same structured tool schema, validation and engineering pipeline.

## Configure

Copy `.env.example` to `.env`:

```dotenv
DEMETER_MODEL_PROVIDER=nebius
NEBIUS_API_KEY=your-server-side-key
NEBIUS_MODEL=your-available-model-id
```

Select a tool-capable model available to your account. Restart the application or reload the page after configuration to refresh the provider label; the backend reads settings for every design request. Run `npm run dev`, enter a design request and start the scene.

Keep `DEMETER_MODEL_PROVIDER=mock` to exercise the complete application without a model account. The simulator emits function-call JSON that drives real geometry, sunlight, structure, flight and hydraulic calculations.

See [Prompt-to-design pipeline](DESIGN.md) for the tool contract, supported local prompts, error behavior and repeatable end-to-end tests.

## Standalone tool-call check

`scripts/nebius_smoke.py` remains available for a separate two-request round trip with an `nvidia/` model. It validates a synthetic budget/terrace update, sends the tool result back and reports latency and usage. It uses the configured provider account and does not run a hydraulic solve.

```sh
python scripts/nebius_smoke.py
```

References: [Function calling](https://docs.tokenfactory.nebius.com/ai-models-inference/function-calling) · [Structured output](https://docs.tokenfactory.nebius.com/ai-models-inference/json).
