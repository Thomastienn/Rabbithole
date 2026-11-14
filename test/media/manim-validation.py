"""Cheap AST checks: no Manim import, scene execution or real render."""

import importlib.util
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
    def test_valid(self):
        renderer.validate(source, brief)
        renderer.validate(source.replace('colors["winner"]', 'palette["amber"]'), brief)
        renderer.validate(source.replace('fonts["heading"]', 'fonts["reading"]'), brief)
        renderer.validate(
            source.replace("colors,", "colors as inks,").replace("colors[", "inks["),
            brief,
        )

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
            source + "\nclass",
        ]:
            with self.subTest(code=code), self.assertRaises((ValueError, SyntaxError)):
                renderer.validate(code, brief)


if __name__ == "__main__":
    unittest.main()
