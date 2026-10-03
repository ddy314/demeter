# Demeter · the film

A 2:46 English product film rendered from Demeter's actual scene components and engineering outputs. 1920 × 1080, 24 fps, H.264 / AAC, with English narration, original ambient music and visible captions and a separate timed SRT file.

## Render locally

Run these commands from the repository root after completing the application setup in the main README. FFmpeg with libx264/libass and Google Chrome are required.

```sh
# Generate geometry, studies and hydraulic search results.
PYTHONPATH=. .venv/bin/python scripts/video/prepare.py

# Install the optional rendering dependency locally.
npm install --no-save --package-lock=false playwright
node scripts/video/render.mjs
```

`CHROME_PATH` overrides the Chrome executable. `PLAYWRIGHT_PATH` can point to an existing Playwright package. `FILM_URL` can use an already served film URL instead of the default isolated production build. Use `--preview` to export representative stills; `START_TIME`, `END_TIME` and `VIDEO_OUTPUT` allow rendering a selected interval.

The video entry point is `apps/web/video.html`. Its frame clock drives the existing orchard, sequential construction, camera, sunlight, hydraulic search replay and drone components. It does not capture the desktop. The renderer builds and serves an isolated production copy, so source edits cannot interrupt frame export. Generated scene data lives in the ignored web public directory; remove `apps/web/public/video-data.json` before building the main application.

## Narration and sound

```sh
python -m venv artifacts/video/work/venv
artifacts/video/work/venv/bin/pip install -r scripts/video/requirements.txt
mkdir -p artifacts/video/models
curl -L --fail --retry 3 -o artifacts/video/models/en_US-ljspeech-high.onnx \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ljspeech/high/en_US-ljspeech-high.onnx
curl -L --fail --retry 3 -o artifacts/video/models/en_US-ljspeech-high.onnx.json \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ljspeech/high/en_US-ljspeech-high.onnx.json
artifacts/video/work/venv/bin/python scripts/video/audio.py
python scripts/video/finish.py
```

The final file is `artifacts/video/Demeter-demo-en.mp4`. Intermediate frames, speech model weights and rendered media are excluded from Git. `story.json` contains the chapter timing, on-screen titles and narration. Sentence captions are aligned to the synthesized speech. The final mix is normalized to −16 LUFS with a −1.5 dB true-peak target.

Voice synthesis uses Piper's `en_US-ljspeech-high` voice. Its [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/high/MODEL_CARD) identifies the LJSpeech dataset as public domain. The soundtrack is synthesized directly by `audio.py`; no external music recordings are used. All scene visuals come from this project's renderer.

## Presentation

The film follows the [Nebius hackathon video requirements](https://nebiusglobalaihackathon.devpost.com/rules): English, under three minutes, showing project functionality. Publishing the finished video to a public YouTube URL is a separate submission step.
