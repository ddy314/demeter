"""Local speech synthesis, original ambient score and timed English captions."""

import json
import math
import re
import wave
from pathlib import Path

import numpy as np
from piper import PiperVoice, SynthesisConfig

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "artifacts/video/work"
OUTPUT = ROOT / "artifacts/video"
story = json.loads((ROOT / "scripts/video/story.json").read_text())
voice = PiperVoice.load(str(OUTPUT / "models/en_US-ljspeech-high.onnx"))
rate = 22050
track = np.zeros(166 * rate, dtype=np.float32)
captions = []
report = []
for shot in story:
    sentences = re.split(r"(?<=[.!?])\s+", shot["voice"])
    chunks = []
    for i, text in enumerate(sentences):
        path = WORK / (shot["id"] + "-" + str(i) + ".wav")
        if not path.exists():
            with wave.open(str(path), "wb") as wav:
                voice.synthesize_wav(
                    text,
                    wav,
                    SynthesisConfig(
                        length_scale=0.94, noise_scale=0.5, noise_w_scale=0.6
                    ),
                )
        with wave.open(str(path), "rb") as wav:
            assert wav.getframerate() == rate
            a = (
                np.frombuffer(wav.readframes(wav.getnframes()), dtype=np.int16).astype(
                    np.float32
                )
                / 32768
            )
        # Remove excessive leading/trailing silence while keeping speech boundaries.
        audible = np.where(abs(a) > 0.009)[0]
        if len(audible):
            a = a[
                max(0, audible[0] - int(0.08 * rate)) : min(
                    len(a), audible[-1] + int(0.16 * rate)
                )
            ]
        chunks.append((text, a))
    actual = sum(len(a) / rate for _, a in chunks) + 0.22 * (len(chunks) - 1)
    available = shot["end"] - shot["start"] - 1.2
    speed = max(1, actual / available)
    assert speed < 1.35, (shot["id"], actual, available)
    t = shot["start"] + 0.6
    for text, a in chunks:
        if speed > 1:
            a = np.interp(np.arange(0, len(a), speed), np.arange(len(a)), a)
        duration = len(a) / rate
        start = round(t * rate)
        track[start : start + len(a)] += a * 0.84
        captions.append({"start": t, "end": t + duration, "text": text})
        t += duration + 0.22 / speed
    report.append(
        {
            "chapter": shot["id"],
            "voice_end": round(t, 2),
            "cut": shot["end"],
            "speed": round(speed, 3),
        }
    )
    print(report[-1], flush=True)
# An original, quiet synthesized pad. No sampled recordings or third-party music.
n = len(track)
t = np.arange(n, dtype=np.float32) / rate
music = np.zeros(n, dtype=np.float32)
chords = [
    [146.832, 220, 293.665, 349.228],
    [130.813, 196, 261.626, 329.628],
    [174.614, 220, 261.626, 349.228],
    [146.832, 196, 293.665, 391.995],
]
for k in range(math.ceil(166 / 8)):
    start = k * 8
    end = min(166, start + 10)
    i0 = int(start * rate)
    i1 = int(end * rate)
    local = t[i0:i1] - start
    envelope = np.minimum(1, local / 1.5) * np.minimum(1, (end - start - local) / 2)
    for f in chords[k % 4]:
        music[i0:i1] += (
            envelope
            * (
                np.sin(2 * np.pi * f * local)
                + 0.16 * np.sin(2 * np.pi * f * 2.001 * local)
            )
            * 0.0033
        )
music *= np.minimum(1, t / 3) * np.minimum(1, (166 - t) / 4)
mix = np.clip(track + music, -0.98, 0.98)
with wave.open(str(OUTPUT / "narration.wav"), "wb") as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(rate)
    wav.writeframes((mix * 32767).astype("<i2").tobytes())


def timestamp(x):
    ms = round(x * 1000)
    return (
        f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"
    )


srt = []
import textwrap

for i, c in enumerate(captions, 1):
    srt.append(
        f"{i}\n{timestamp(c['start'])} --> {timestamp(c['end'])}\n"
        + "\n".join(textwrap.wrap(c["text"], 76))
        + "\n"
    )
(OUTPUT / "demeter.en.srt").write_text("\n".join(srt))
(WORK / "audio-report.json").write_text(json.dumps(report, indent=2))
print("Audio and captions ready")
