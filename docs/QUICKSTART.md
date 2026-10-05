# Demeter container quick start

The downloadable image contains the complete English 3D studio and Python engineering service, including EPANET. It runs on Linux x86-64, or Docker Desktop on Windows and macOS with Linux/amd64 support. Allow at least 2 GB of memory. Apple Silicon uses Docker's amd64 emulation.

## Start without an API key

Download `demeter-v0.2.0-linux-amd64.tar.gz` and `SHA256SUMS` from this release. Verify and import the image:

```sh
sha256sum -c SHA256SUMS
docker load -i demeter-v0.2.0-linux-amd64.tar.gz
docker run -d --name demeter --platform linux/amd64 \
  -p 127.0.0.1:8080:8000 --memory 2g --cpus 2 \
  demeter:v0.2.0
```

Open **http://localhost:8080**. Select any of the three briefs and press the arrow to watch the terrain, orchard, structures and network assemble. Explore sunlight, irrigation, drone coverage and economics, or export the study. The Workbench supports editable terrain and hydraulic design.

The default local planner accepts the showcase prompts and explicit parameter clauses:

```text
Plan a 160 x 90 m orchard; rise 12 m; budget 40k;
two greenhouses; winter; swath 4 m.
```

## Use real NVIDIA Nemotron on Nebius Token Factory

Create a file named `.env` next to the downloaded image:

```dotenv
DEMETER_MODEL_PROVIDER=nebius
NEBIUS_API_KEY=your-token-factory-api-key
NEBIUS_MODEL=nvidia/nemotron-3-super-120b-a12b
```

Replace the local container with one configured for real inference:

```sh
docker stop demeter
docker rm demeter
docker run -d --name demeter --platform linux/amd64 --env-file .env \
  -p 127.0.0.1:8080:8000 --memory 2g --cpus 2 \
  demeter:v0.2.0
```

Free-form design briefs now call Nemotron through Token Factory. Model proposals become validated scene and study parameters; deterministic engines calculate geometry, light, coverage, economics and hydraulic feasibility. API keys stay in the server process. Token Factory inference consumes your account's available credits.

## Stop, resume and preserve exports

```sh
docker stop demeter
docker start demeter
```

Removing the container removes its saved run exports. Download studies from the UI first, or mount a persistent Docker volume at `/app/data` with write access for UID 10001. The service listens only on your machine via the port binding above.

## Online showcase

Visit **https://ddy314.github.io/demeter/** for the three interactive scenarios without installation. The Pages site replays captured Nemotron proposals and actual engineering solver results; its construction, camera tour, sunlight controls, financial sensitivity and exports run in the browser. Custom prompts and new hydraulic computations run in the container edition.
