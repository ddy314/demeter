# Run Demeter with NVIDIA Nemotron

Demeter uses **NVIDIA Nemotron 3 Super** on **Nebius Token Factory** to translate a design brief into a validated orchard tool call. The same application then constructs geometry, studies sunlight and drone coverage, and evaluates irrigation designs with EPANET.

## Configure the model

Copy `.env.example` to `.env` and set:

```dotenv
DEMETER_MODEL_PROVIDER=nebius
NEBIUS_API_KEY=your-token-factory-api-key
NEBIUS_MODEL=nvidia/nemotron-3-super-120b-a12b
```

The model ID can be checked against the authenticated Token Factory `/v1/models` catalog. Credentials are read by the Python service, excluded from Git and Docker build context, and never supplied to the frontend.

## Run the production container

```sh
docker build -t demeter:nebius .
docker run -d --name demeter-nebius \
  --env-file .env \
  --publish 127.0.0.1:8080:8000 \
  --memory 2g --cpus 2 --pids-limit 128 \
  demeter:nebius
```

Open [localhost:8080](http://localhost:8080). The image serves the built frontend and API together, runs as an unprivileged user, and keeps one API worker so SSE events and run exports share state. EPANET runs from a writable data directory because it creates internal hydraulic scratch files in its working directory.

Use `docker stop demeter-nebius` to stop the application and `docker start demeter-nebius` to resume it. Run exports persist in the container's data directory until the container is removed. To retain them across replacements, attach a writable volume at `/app/data`, owned by UID 10001.

## Verify live inference and the complete workflow

These commands make bounded, real Token Factory requests:

```sh
uv run python scripts/nebius_smoke.py
uv run python -m scripts.verify_nebius
uv run python -m scripts.verify_design --provider nebius
uv run python -m scripts.verify_design --provider nebius \
  --base-url http://localhost:8080 \
  --output artifacts/nebius-container-validation.json
```

The interpretation check covers the three showcase prompts, a free-form English brief, preservation of unchanged parameters, and clarification of an ambiguous request. The workflow check verifies requested dimensions, greenhouse count and winter date, then consumes actual solver events and checks the exported result.

Live verification reports are saved in `artifacts/nebius-interpretation-validation.json`, `artifacts/nebius-design-validation.json` and `artifacts/nebius-container-validation.json`. The reference custom design contains 188 planting nodes and two greenhouses; its EPANET search evaluates 108 configurations with 58 feasible designs.

## Nebius AI Cloud hosting

The same image can run on a CPU **Nebius Serverless Endpoint**, listening on port 8000. NVIDIA model inference stays on Token Factory, so the application does not require a dedicated GPU instance. Configure the three model variables as server-side secrets and use a single endpoint instance for the current in-memory solver event store.

AI Cloud compute and storage are billed separately from Token Factory inference credits. Its account billing must be activated before starting an endpoint. An endpoint accrues compute and storage charges while running; stopping it stops both charges, according to the [Serverless AI billing documentation](https://docs.nebius.com/serverless/pricing-quotas). The current verification uses local production containers and real Token Factory inference.

The hackathon accepts a runtime Token Factory API call as running on Nebius; AI Cloud application hosting is optional. See the [official project requirements](https://nebiusglobalaihackathon.devpost.com/rules).
