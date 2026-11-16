"""Trusted entry point. Parsing and all generated Python run only inside bubblewrap."""

import ast
import json
import re
import shutil
import struct
import sys
import traceback
import zlib
from pathlib import Path


def font_ttf(source, target):
    # Fontsource ships WOFF; Pango needs the uncompressed SFNT tables for these fonts.
    data = source.read_bytes()
    count = struct.unpack_from(">H", data, 12)[0]
    power = count.bit_length() - 1
    header = struct.pack(
        ">4sHHHH", data[4:8], count, 16 * 2**power, power, count * 16 - 16 * 2**power
    )
    records, tables = b"", b""
    offset = 12 + 16 * count
    for i in range(count):
        tag, pos, size, original, checksum = struct.unpack_from(
            ">4sIIII", data, 44 + 20 * i
        )
        table = data[pos : pos + size]
        if size < original:
            table = zlib.decompress(table)
        records += struct.pack(">4sIII", tag, checksum, offset, len(table))
        aligned = table + b"\0" * (-len(table) % 4)
        tables += aligned
        offset += len(aligned)
    target.write_bytes(header + records + tables)


# shortcut: common CSS colour names only, not all 148; extend if models slip others through.
NAMED = re.compile(
    r"\b[a-z]*(?:white|black|red|green|blue|yellow|orange|purple|pink|gr[ae]y|silver|gold|cyan|magenta|lime|navy|teal|maroon|olive|aqua|fuchsia|violet|indigo|brown|crimson|coral|salmon|tomato|turquoise|beige|ivory|khaki|lavender|plum|orchid)\b",
    re.I,
)
# Manim's own colour constants (RED, BLUE_E, PURE_GREEN, LIGHT_GRAY, ...); the kit exports none.
MANIM_COLOR = re.compile(
    r"^[A-Z_]*(?:WHITE|BLACK|GR[AE]Y|RED|GREEN|BLUE|YELLOW|GOLD|TEAL|MAROON|PURPLE|PINK|ORANGE|BROWN)[A-Z_]*$"
)
HOUSE_FONT = re.compile(r"archivo|literata", re.I)


def validate(source, brief):
    tree = ast.parse(source)
    bindings, locals_, stored = {}, {}, set()
    allowed = set(brief["palette"])

    def style_error(name, node):
        raise ValueError(
            f"Manim cut breaks the style brief colors or fonts: {name}={ast.get_source_segment(source, node) or ast.unparse(node)}"[
                :160
            ]
            + ". Use colors['<role>'], palette['<neutral>'], fonts['heading'] or fonts['reading']."
        )

    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Import)
            or isinstance(node, ast.ImportFrom)
            and (
                node.module != "kit"
                or node.level
                or any(n.name == "*" for n in node.names)
            )
        ):
            raise ValueError("Manim cut must import only named objects from kit.")
        if isinstance(node, ast.ImportFrom):
            for name in node.names:
                bindings[name.asname or name.name] = name.name
        if (
            isinstance(node, ast.Assign)
            and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Name)
        ):
            locals_[node.targets[0].id] = node.value
        if isinstance(node, ast.Name) and not isinstance(node.ctx, ast.Load):
            stored.add(node.id)
        if isinstance(node, ast.arg):
            stored.add(node.arg)
    stored |= set(bindings)

    # Only literal text can introduce a foreign hue or font; any expression built from kit values passes.
    def style(node, font=False, seen=frozenset()):
        if isinstance(node, ast.Constant):
            return not isinstance(node.value, str) or bool(
                font and HOUSE_FONT.fullmatch(node.value)
            )
        if isinstance(node, ast.JoinedStr):
            parts = [
                v.value
                for v in node.values
                if isinstance(v, ast.Constant) and v.value.strip()
            ]
            return all(
                HOUSE_FONT.fullmatch(t) if font else not NAMED.search(t) for t in parts
            )
        if isinstance(node, ast.Name) and node.id in locals_ and node.id not in seen:
            return style(locals_[node.id], font, seen | {node.id})
        if isinstance(node, ast.Subscript):
            return bindings.get(getattr(node.value, "id", None)) in (
                "palette",
                "colors",
                "fonts",
            ) or style(node.value, font, seen)
        if isinstance(node, ast.Dict):
            return all(style(v, font, seen) for v in node.values)
        children = (
            [node.body, node.orelse]
            if isinstance(node, ast.IfExp)
            else node.values
            if isinstance(node, ast.BoolOp)
            else [node.left, node.right]
            if isinstance(node, ast.BinOp)
            else node.elts
            if isinstance(node, (ast.Tuple, ast.List))
            else []
        )
        return all(style(c, font, seen) for c in children)

    def style_key(key):
        return isinstance(key, str) and (
            "color" in key or key in ("fill", "stroke", "font", "t2c", "t2f", "t2g")
        )

    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Constant)
            and isinstance(node.value, str)
            and re.search(r"#[\da-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(", node.value, re.I)
        ):
            raise ValueError(
                f"Manim cut breaks the style brief colors or fonts: {node.value[:60]!r} is not a kit color. Use colors['<role>'] or palette['<neutral>']."
            )
        if (
            isinstance(node, ast.Name)
            and node.id not in stored
            and MANIM_COLOR.match(node.id)
        ):
            raise ValueError(
                f"Manim cut breaks the style brief colors or fonts: {node.id} is a Manim color, not a kit color. Use colors['<role>'] or palette['<neutral>']."
            )
        if isinstance(node, ast.Dict):
            for key, value in zip(node.keys, node.values):
                if (
                    isinstance(key, ast.Constant)
                    and style_key(key.value)
                    and not style(value, key.value in ("font", "t2f"))
                ):
                    style_error(key.value, value)
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if (
                    isinstance(target, ast.Subscript)
                    and isinstance(target.value, ast.Name)
                    and bindings.get(target.value.id) in ("palette", "colors", "fonts")
                ):
                    raise ValueError("Manim cut must keep the house palette and fonts.")
                if (
                    isinstance(target, ast.Attribute)
                    and style_key(target.attr)
                    and not style(node.value, target.attr in ("font", "t2f"))
                ):
                    style_error(target.attr, node.value)
        if isinstance(node, ast.Call):
            name = (
                node.func.id
                if isinstance(node.func, ast.Name)
                else getattr(node.func, "attr", "")
            )
            name = bindings.get(name, name)
            if name == "stockPiece" and (
                len(node.args) != 1
                or not isinstance(node.args[0], ast.Constant)
                or not isinstance(node.args[0].value, str)
                or node.args[0].value not in brief.get("stock", {})
                or node.keywords
            ):
                raise ValueError("Manim stockPiece must name an offered 2D stock ID.")
            if name in (
                "open",
                "exec",
                "eval",
                "__import__",
                "compile",
                "MarkupText",
                "set_default",
                "add_sound",
                "SVGMobject",
                "ImageMobject",
            ):
                raise ValueError(
                    "Manim cut uses a disallowed resource or changes house defaults."
                )
            if name in (
                "set_color",
                "set_fill",
                "set_stroke",
                "set_background_stroke",
                "set_color_by_tex",
                "set_color_by_gradient",
            ):
                values = (
                    node.args[1:2]
                    if name == "set_color_by_tex"
                    else node.args
                    if name == "set_color_by_gradient"
                    else node.args[:1]
                )
                for value in values:
                    if not style(value):
                        style_error(name, value)
            for keyword in node.keywords:
                if style_key(keyword.arg) and not style(
                    keyword.value, keyword.arg in ("font", "t2f")
                ):
                    style_error(keyword.arg, keyword.value)
        if (
            isinstance(node, ast.Subscript)
            and isinstance(node.value, ast.Name)
            and isinstance(node.slice, ast.Constant)
        ):
            base, key = bindings.get(node.value.id), node.slice.value
            if (
                base == "palette"
                and key not in allowed
                or base == "colors"
                and key not in brief["colors"]
                or base == "fonts"
                and key not in ("heading", "reading")
            ):
                raise ValueError(
                    f"Manim cut breaks the style brief colors or fonts: {node.value.id}[{key!r}] is not in this brief."
                )
        if (
            isinstance(node, ast.Attribute)
            and node.attr in ("camera", "renderer", "config")
            or isinstance(node, ast.Name)
            and node.id == "config"
        ):
            raise ValueError("Manim cut must keep the house frame and ground.")
    scenes = [
        node
        for node in tree.body
        if isinstance(node, ast.ClassDef) and node.name == "Cut"
    ]
    if (
        len(scenes) != 1
        or len(scenes[0].bases) != 1
        or not isinstance(scenes[0].bases[0], ast.Name)
        or bindings.get(scenes[0].bases[0].id) != "HouseScene"
    ):
        raise ValueError("Manim cut must define class Cut(HouseScene).")
    if any(
        not isinstance(n, ast.FunctionDef) or n.name != "construct"
        for n in scenes[0].body
    ):
        raise ValueError("Manim cut may override only construct(self).")
    return tree


def render(workspace, output, modules):
    brief = json.loads(Path("brief.json").read_text())
    source = Path("Cut.py").read_text()
    tree = validate(source, brief)
    try:
        import manimpango
        from manim import tempconfig

        if not all(shutil.which(tool) for tool in ("latex", "dvisvgm")):
            raise RuntimeError("LaTeX unavailable inside the render sandbox")
        for family in ("archivo", "literata"):
            target = workspace / "tmp" / f"{family}.ttf"
            font_ttf(
                modules
                / "@fontsource"
                / family
                / "files"
                / f"{family}-latin-400-normal.woff",
                target,
            )
            if not manimpango.register_font(str(target)):
                raise RuntimeError("font registration failed")
        if not {"Archivo", "Literata"} <= set(manimpango.list_fonts()):
            raise RuntimeError("house fonts unavailable")
    except Exception:
        print(
            json.dumps(
                {
                    "error": "Manim unavailable: Python dependencies or house fonts could not load. Run npm start to repair.",
                    "unavailable": True,
                }
            )
        )
        return
    # Isolated mode ignores user Python paths. Only this cut's private kit is importable.
    sys.path.insert(0, str(workspace))
    with tempconfig(
        {
            "pixel_width": 1920,
            "pixel_height": 1080,
            "frame_rate": 30,
            "frame_height": 8,
            "frame_width": 128 / 9,
            "background_color": brief["palette"]["ground"],
            "renderer": "cairo",
            "media_dir": str(workspace / "tmp" / "manim"),
            "output_file": str(output),
            "format": "mp4",
            "disable_caching": True,
            "verbosity": "ERROR",
            "progress_bar": "none",
            "preview": False,
        }
    ):
        namespace = {"__name__": "cut"}
        exec(compile(tree, "Cut.py", "exec"), namespace)
        namespace["Cut"]().render()
    timing = json.loads(Path("narration.json").read_text())
    print(json.dumps({"durationInFrames": timing["durationInFrames"], "fps": 30}))


def check():
    # Check-only mode: validate the staged cut without importing Manim or rendering.
    try:
        validate(Path("Cut.py").read_text(), json.loads(Path("brief.json").read_text()))
    except (ValueError, SyntaxError) as error:
        traceback.print_exc()
        message = (
            f"Manim cut has a syntax error: {error.msg} (line {error.lineno})."
            if isinstance(error, SyntaxError)
            else str(error)
        )
        print(json.dumps({"error": message}))
        return
    print(json.dumps({"ok": True}))


if __name__ == "__main__" and sys.argv[1:2] == ["--check"]:
    check()
elif __name__ == "__main__":
    try:
        render(*(Path(p) for p in sys.argv[1:]))
    except (ValueError, SyntaxError):
        traceback.print_exc()
        print(
            json.dumps(
                {
                    "error": "Manim cut is invalid or breaks the house style. Use kit colors/fonts and class Cut(HouseScene)."
                }
            )
        )
    except Exception:
        traceback.print_exc()
        print(
            json.dumps(
                {
                    "error": "Manim cut rendering failed. Check scene code and LaTeX; run npm start to check the Manim installation."
                }
            )
        )
