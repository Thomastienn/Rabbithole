"""Cheap AST checks: no Manim import, scene execution or real render."""

import importlib.util
import re
import sys
from pathlib import Path
import unittest

root = Path(__file__).resolve().parents[2]
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location(
    "renderer", root / "server/media/manim-render.py"
)
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)
brief = {
    "palette": {"ground": "#1a1613", "paper": "#efe6d6", "amber": "#dfae4e"},
    "colors": {"winner": "#dfae4e"},
}
source = """from kit import HouseScene, MathTex, Text, colors, palette, fonts
class Cut(HouseScene):
    def construct(self):
        color = colors["winner"]
        self.add(MathTex("x=1", color=color))
        self.add(Text("Winner", font=fonts["heading"], color=palette["paper"]))
"""


class Validation(unittest.TestCase):
    def test_stock_retired_and_loader_ban(self):
        code = source.replace("HouseScene,", "HouseScene, stockPiece as stock,")
        code += '\nstock("fluent-emoji:horse")'
        with self.assertRaisesRegex(ValueError, "stock pieces are retired"):
            renderer.validate(code, {**brief, "stock": {"fluent-emoji:horse": "stock-0.svg"}})
        for name in ("SVGMobject", "ImageMobject"):
            with self.assertRaisesRegex(ValueError, "disallowed resource"):
                renderer.validate(source + f'\nfrom kit import {name} as load\nload("horse.svg")', brief)

    def test_valid(self):
        renderer.validate(source, brief)

    def test_true_colour_role(self):
        true = {**brief, "colors": {**brief["colors"], "earth": "#2b6cb0"}}
        renderer.validate(source.replace('colors["winner"]', 'colors["earth"]'), true)
        with self.assertRaisesRegex(ValueError, "not a kit color"):
            renderer.validate(source.replace('colors["winner"]', '"#2b6cb0"'), true)
        renderer.validate(source.replace('colors["winner"]', 'palette["amber"]'), brief)
        renderer.validate(source.replace('fonts["heading"]', 'fonts["reading"]'), brief)
        renderer.validate(
            source.replace("colors,", "colors as inks,").replace("colors[", "inks["),
            brief,
        )

    def test_kit_expressions(self):
        for body in [
            "for c in [colors['winner'], palette['paper']]:\n            self.add(Dot(color=c))",
            "def tint(i, c=palette['paper']):\n            return Dot(color=c if i else colors['winner'])\n        self.add(tint(1))",
            "self.add(MathTex('x', 'y', t2c={'x': colors['winner'], 'y': palette['amber']}))",
            "key = 'winner'\n        self.add(Dot(color=colors[key]))",
            "inks = {k: colors[k] for k in colors}\n        self.add(Dot().set_color(inks['winner']))",
            "self.add(Text('a', t2f={'a': fonts['reading']}, font='Archivo'))",
            "RED_SHIFT = 2\n        self.add(Dot(point(RED_SHIFT, 0)))",
        ]:
            with self.subTest(body=body):
                renderer.validate(source + "        " + body + "\n", brief)

    def test_named_errors(self):
        for code, named in [
            (source.replace('colors["winner"]', '"#ff0000"'), "'#ff0000'"),
            (source.replace('colors["winner"]', "RED"), "RED"),
            (source + '\nText("a", font="Arial")', 'font="Arial"'),
            (source + '\nText("a", t2c={"a": "red"})', 't2c={"a": "red"}'),
            (source + '\nDot().set_fill("blue")', 'set_fill="blue"'),
            (
                source.replace('colors["winner"]', 'colors["missing"]'),
                "colors['missing']",
            ),
        ]:
            with (
                self.subTest(code=code),
                self.assertRaisesRegex(ValueError, re.escape(named)),
            ):
                renderer.validate(code, brief)

    def test_invalid(self):
        for code in [
            source.replace('colors["winner"]', 'palette["leaf"]'),
            source.replace('colors["winner"]', 'colors["missing"]'),
            source.replace('colors["winner"]', '"red"'),
            source.replace('fonts["heading"]', '"Arial"'),
            source.replace("from kit", "from manim"),
            source.replace("class Cut(HouseScene)", "class Cut(Scene)"),
            source.replace("def construct", "def setup"),
            source + "\nimport os",
            source + "\nfrom os import path",
            source + "\nfrom kit import *",
            source + '\nopen("secret")',
            source + '\nText.set_default(font="Arial")',
            source + '\nconfig.background_color = "red"',
            source + '\nText("label").set_color("blue")',
            source + '\nText("label").set_color_by_tex("label", "red")',
            source + '\nText("label").set_color_by_gradient("red", "blue")',
            source + '\nAxes(axis_config={"color": "red"})',
            source + '\nText("label", t2c={"label": "red"})',
            source + '\ncolors["winner"] = "red"',
            source + '\nText("label").color = "red"',
            source + '\nred = "#ff0000"',
            source + '\nText("label", color=BLUE_E)',
            source + '\nText("label", color="rgb(255, 0, 0)")',
            source + '\nText("label", font=f"Comic {1}")',
            source + "\nclass",
        ]:
            with self.subTest(code=code), self.assertRaises((ValueError, SyntaxError)):
                renderer.validate(code, brief)


if __name__ == "__main__":
    unittest.main()
