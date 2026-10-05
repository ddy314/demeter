# Prompt-to-design pipeline

Demeter connects an editable prompt to the same geometry, study and hydraulic engines used by the workbench. The model proposes inputs; the engines calculate the results.

```text
Prompt + current scene + study inputs
  → planner provider
  → propose_orchard_design tool call
  → schema and engineering validation
  → updated geometry
  → sunlight / greenhouses / drone study + EPANET search
  → construction sequence, guided tour and JSON export
```

## Run locally

The default provider is `mock`, a deterministic model-response simulator. Open the demo, choose **Try a custom plan**, edit the prompt and press the arrow or Ctrl/Cmd+Enter:

```text
Plan a 160 x 90 m orchard; rise 12 m; budget 40k;
two greenhouses; winter; swath 4 m.
```

The simulator produces an OpenAI-compatible function-call envelope. The application validates and executes it through the same path used by the Nebius adapter. [Example response](../examples/model-tool-call.json).

The three showcase prompts are shared between frontend and backend in [`examples/design-prompts.json`](../examples/design-prompts.json). Other local requests use semicolon-separated parameter clauses:

| Clause                                                 | Field                          | Unit                 |
| ------------------------------------------------------ | ------------------------------ | -------------------- |
| `Plan a 160 x 90 m orchard`                            | width, depth                   | m                    |
| `rise 12 m`                                            | elevation change               | m                    |
| `budget 40k`                                           | irrigation installation budget | CNY                  |
| `terraces 5`                                           | terrace count                  | integer              |
| `tree spacing 6 m; row spacing 8 m`                    | planting spacing               | m                    |
| `two greenhouses`                                      | requested structures           | 0–4                  |
| `winter` / `summer` / `day 172`                        | day of year                    | 1–365                |
| `latitude 30.6`                                        | latitude                       | degrees              |
| `transmission 0.72`                                    | roof transmission              | fraction             |
| `swath 4 m; drone speed 3 m/s`                         | flight parameters              | m, m/s               |
| `price 8 CNY/kg; yield 35 kg/tree`                     | economic inputs                | CNY/kg, kg/tree/year |
| `source flow 220 l/min`                                | source capacity                | L/min                |
| `minimum pressure 0.24 MPa; maximum pressure 0.95 MPa` | pressure bounds                | MPa                  |

Unrecognized, negative or conflicting local instructions return a clarification without applying partial edits. The simulator is bounded grammar, not a trained language model; unrestricted language interpretation uses the configured model provider.

## Model contract

`POST /api/design` accepts `{prompt, scene, inputs}`. Providers return exactly one `propose_orchard_design` call with:

```json
{
  "scene": { "width": 160, "depth": 90, "rise": 12, "budget": 40000 },
  "inputs": { "greenhouses": 2, "day": 355, "swath_m": 4 }
}
```

Fields omitted from a patch retain the current values. Bounds are derived from the engine's Pydantic models, and the merged scene passes relational and geometry checks. Boundary vertices, source coordinates, exclusions and random seed remain editable in the workbench rather than through this tool.

For an ambiguous request, the provider returns `{"question":"Which budget should I use?"}` with no edits. The UI keeps the prompt editable. Unknown fields, multiple calls, truncated output, invalid JSON, non-finite numbers and unsupported tool names are rejected.

A ready response contains the validated scene, study inputs, preview geometry and a trace: provider, model, original prompt, tool patch, changed fields, base/final scene revisions, latency and token counts. The demo's JSON export includes that trace beside the actual study and solver events. A scene revision identifies terrain/hydraulic inputs; study parameters are exported separately.

The frontend sends the validated values to `/api/study` and `/api/runs`; live SSE events populate the construction and result views. The 26-second animation timeline remains independent of actual solver duration. Infeasible budgets stay infeasible. Model output never supplies computed pressure, coverage or financial results.

## Nebius adapter

Copy `.env.example` to `.env` and configure:

```dotenv
DEMETER_MODEL_PROVIDER=nebius
NEBIUS_API_KEY=your-server-side-key
NEBIUS_MODEL=nvidia/nemotron-3-super-120b-a12b
```

Use the exact tool-capable model ID available to your account. Settings are read on each design request. Reload the page after switching providers to refresh its small provider label.

The adapter sends the prompt, base scene, study inputs and generated tool schema to Nebius Token Factory's Chat Completions endpoint. It forces the named function, limits output to 2,048 tokens, allows two concurrent requests and uses a 45-second network timeout. The UI cancels its request after 60 seconds or on a scenario change. Cancelling the browser request does not guarantee cancellation of a provider request already in progress.

Keys stay server-side. Provider errors are reported without copying raw response bodies; redirects and automatic retries are disabled. A configured Nebius failure does not silently switch to simulated output. The default simulator makes no external calls.

The adapter follows Nebius's [function-calling contract](https://docs.tokenfactory.nebius.com/ai-models-inference/function-calling). The NVIDIA Nemotron 3 Super integration has been verified through real Token Factory requests and the complete geometry, study, EPANET and export workflow. Provider tool schemas inline nested field definitions and retain the engineering bounds, including explicit season-to-day mapping. See [live verification and deployment](DEPLOYMENT.md).

## Reproduce the complete workflow

```sh
uv run python -m scripts.verify_design
```

This command always selects the local simulator. It resolves the custom prompt, constructs terrain, computes the integrated study, evaluates 108 actual EPANET configurations, consumes SSE events and checks the run export. Its report is saved to `artifacts/design-validation.json`.

```sh
uv run pytest tests/test_design.py -q
```

Tests also start a loopback HTTP provider to exercise the actual Nebius request adapter without cloud credentials. Coverage includes schema failures, unchanged unspecified fields, unknown/contradictory instructions, HTTP errors, redirects, timeout handling, bounded concurrency and a genuinely infeasible budget.

To verify the same workflow with real Token Factory inference, add `--provider nebius`. To target a running container or deployment, also pass `--base-url http://localhost:8080`. These options make external model requests; the default command remains offline.
