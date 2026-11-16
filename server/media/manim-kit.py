"""Rabbithole math building blocks, staged privately as kit.py beside each cut."""

import json
from math import sin, cos
from pathlib import Path

from manim import (
    Scene,
    SVGMobject,
    Text,
    MathTex,
    Tex,
    VGroup,
    Group,
    Dot,
    Circle,
    Rectangle,
    Square,
    Line,
    Arrow,
    Axes,
    NumberPlane,
    ValueTracker,
    DecimalNumber,
    Brace,
    always_redraw,
    FadeIn,
    FadeOut,
    Write,
    Create,
    Transform,
    ReplacementTransform,
    TransformMatchingTex,
    Indicate,
    AnimationGroup,
    LaggedStart,
    GrowArrow,
    UP,
    DOWN,
    LEFT,
    RIGHT,
    ORIGIN,
    PI,
    TAU,
    smooth,
    linear,
)

palette = json.loads(Path("brief.json").read_text())["palette"]
colors = json.loads(Path("brief.json").read_text())["colors"]
fonts = {"heading": "Archivo", "reading": "Literata"}
frame = {"width": 1920, "height": 1080, "margin": 80, "top": 64, "subtitles": 120}

Text.set_default(font=fonts["heading"], color=palette["paper"], font_size=40)
for shape in (
    Tex,
    MathTex,
    Dot,
    Circle,
    Rectangle,
    Square,
    Line,
    Arrow,
    DecimalNumber,
    Brace,
):
    shape.set_default(color=palette["paper"])
Axes.set_default(axis_config={"color": palette["paper"]})
NumberPlane.set_default(
    axis_config={"color": palette["paper"]},
    background_line_style={"stroke_color": palette["muted"], "stroke_opacity": 0.3},
)


def point(x, y):
    return (x - 960) / 135 * RIGHT + (540 - y) / 135 * UP


def stockPiece(id):
    """An offered 2D piece from the host's cache, with its original colours."""
    path = json.loads(Path("brief.json").read_text()).get("stock", {}).get(id)
    if not path:
        raise ValueError(f"Stock piece {id} is missing")
    piece = SVGMobject(path)
    return piece.scale((200 / 135) / max(piece.width, piece.height))


class HouseScene(Scene):
    def setup(self):
        timing = json.loads(Path("narration.json").read_text())
        self.sentences = timing["sentences"]
        # Scene.duration belongs to the current animation, not the whole cut.
        self.cut_duration = timing["durationInFrames"] / 30
        self.audio_duration = timing["audioFrames"] / 30

    def tear_down(self):
        if self.time > self.cut_duration + 1 / 30:
            raise ValueError("Manim cut exceeds its measured narration duration.")
        remaining = self.cut_duration - self.time
        if remaining > 1 / 60:
            self.wait(remaining, frozen_frame=True)
