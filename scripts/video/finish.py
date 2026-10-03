"""Mux the rendered film, local narration and English captions."""

import argparse
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "artifacts/video"


def ass_time(value):
    h, m, s = value.replace(",", ".").split(":")
    return f"{int(h)}:{int(m):02}:{float(s):05.2f}"


header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,29,&H003D2714,&H003D2714,&H10F7F5F3,&H10F7F5F3,0,0,0,0,100,100,0,0,3,10,0,2,120,120,87,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
events = []
for block in (OUT / "demeter.en.srt").read_text().strip().split("\n\n"):
    lines = block.splitlines()
    start, end = lines[1].split(" --> ")
    text = "\\N".join(lines[2:])
    events.append(
        f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Default,,0,0,0,,{text}"
    )
(OUT / "demeter.en.ass").write_text(header + "\n".join(events) + "\n")
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--captions-only", action="store_true")
args = parser.parse_args()
if not args.captions_only:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "warning",
            "-i",
            str(OUT / "work/visual.mp4"),
            "-i",
            str(OUT / "narration.wav"),
            "-i",
            str(OUT / "demeter.en.srt"),
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-map",
            "2:0",
            "-vf",
            "ass=" + str(OUT / "demeter.en.ass"),
            "-af",
            "loudnorm=I=-16:TP=-1.5:LRA=11",
            "-c:v",
            "libx264",
            "-preset",
            "slow",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-ar",
            "48000",
            "-c:s",
            "mov_text",
            "-metadata:s:a:0",
            "language=eng",
            "-metadata:s:s:0",
            "language=eng",
            "-metadata",
            "title=Demeter — Shape the land. See what grows.",
            "-t",
            "166",
            "-movflags",
            "+faststart",
            str(OUT / "Demeter-demo-en.mp4"),
        ],
        check=True,
    )
    result = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "quiet",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            str(OUT / "Demeter-demo-en.mp4"),
        ]
    )
    (OUT / "media-info.json").write_bytes(result)
    print("Finished: " + str(OUT / "Demeter-demo-en.mp4"))
