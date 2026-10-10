#!/usr/bin/env python3
"""
边界检查。不需要任何依赖：

    python scripts/check-boundaries.py

检查四件事，任何一件不过就退出码 1（可以挂到 pre-commit 或 CI 上）：

  1. 功能模块**不许 import 壳**（shell/）—— 壳是单人独占的，功能只能通过 props 接入
  2. 功能模块**不许互相 import** —— 需要共享就提到 lib/，并通知所有人
  3. 每个 features/<名>/ 都要有 index.ts 且默认导出，否则前端挂不上
  4. artifactType 不能重复注册 —— 两个功能抢同一个类型，画布会张冠李戴

这些是「大家都能看到框架、但不能随意改」的技术保障：
光写在文档里的规则会被违反，能跑出红字的规则不会。
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FEATURES = ROOT / "frontend" / "src" / "features"
SHELL = ROOT / "frontend" / "src" / "shell"

# import ... from '...'  /  import('...')
RE_IMPORT = re.compile(r"""(?:from|import)\s*\(?\s*['"]([^'"]+)['"]""")

problems: list[str] = []


def rel(p: Path) -> str:
    try:
        return str(p.relative_to(ROOT))
    except ValueError:
        return str(p)


def src_files(folder: Path) -> list[Path]:
    return [p for p in folder.rglob("*") if p.suffix in (".ts", ".tsx")]


def _under(path: Path, root: Path) -> Path | None:
    """path 是否在 root 之内？是则返回相对路径，否则 None。"""
    try:
        return path.relative_to(root)
    except ValueError:
        return None


def check_isolation() -> None:
    print("[1] 功能模块与壳 / 其他功能之间的隔离")
    if not FEATURES.exists():
        problems.append(f"找不到 {rel(FEATURES)}")
        return

    features_root = FEATURES.resolve()
    shell_root = SHELL.resolve()
    violations = 0

    for feat in sorted(p for p in FEATURES.iterdir() if p.is_dir()):
        for f in src_files(feat):
            text = f.read_text(encoding="utf-8", errors="replace")
            for spec in RE_IMPORT.findall(text):
                # 只检查相对路径。裸模块名（react / three 等）不归这里管。
                # ★ 必须做真正的路径解析 —— '../graph/preview' 这种写法里
                #   根本不含 "features/" 字样，靠字符串匹配会漏掉。
                if not spec.startswith("."):
                    continue
                target = (f.parent / spec).resolve()

                if _under(target, shell_root) is not None:
                    problems.append(f"{rel(f)} 导入了壳：{spec}  → 功能不能依赖 shell/")
                    violations += 1
                    continue

                inner = _under(target, features_root)
                if inner is not None and inner.parts and inner.parts[0] != feat.name:
                    problems.append(
                        f"{rel(f)} 导入了另一个功能「{inner.parts[0]}」：{spec}"
                        f"  → 共享代码请提到 src/lib/ 并通知全员"
                    )
                    violations += 1

    if not violations:
        print("    ✓ 没有跨边界 import")


def check_registration() -> None:
    print("[2] 功能注册完整性")
    if not FEATURES.exists():
        return
    missing = []
    for feat in sorted(p for p in FEATURES.iterdir() if p.is_dir()):
        idx = feat / "index.ts"
        if not idx.exists():
            missing.append(feat.name)
            problems.append(f"{rel(feat)} 缺少 index.ts → 该功能不会出现在左栏")
            continue
        text = idx.read_text(encoding="utf-8", errors="replace")
        if "export default" not in text:
            problems.append(f"{rel(idx)} 没有默认导出 → 自动注册会拿到 undefined")
            missing.append(feat.name)
        if f"id: '{feat.name}'" not in text and f'id: "{feat.name}"' not in text:
            problems.append(f"{rel(idx)} 的 id 与文件夹名 {feat.name} 不一致 → 会注册成两个功能")
    if not missing:
        print(f"    ✓ {len(list(p for p in FEATURES.iterdir() if p.is_dir()))} 个功能都已正确注册")


def check_artifact_types() -> None:
    print("[3] artifactType 唯一性")
    RE_TYPES = re.compile(r"artifactTypes\s*:\s*\[([^\]]*)\]")
    RE_STR = re.compile(r"['\"]([^'\"]+)['\"]")
    owner: dict[str, str] = {}
    dupes = 0
    for feat in sorted(p for p in FEATURES.iterdir() if p.is_dir()):
        idx = feat / "index.ts"
        if not idx.exists():
            continue
        m = RE_TYPES.search(idx.read_text(encoding="utf-8", errors="replace"))
        if not m:
            problems.append(f"{rel(idx)} 里没找到 artifactTypes")
            continue
        for t in RE_STR.findall(m.group(1)):
            if t in owner:
                problems.append(
                    f"artifactType「{t}」被 {owner[t]} 和 {feat.name} 同时注册"
                    f" → 画布会张冠李戴"
                )
                dupes += 1
            owner[t] = feat.name
    if not dupes:
        print(f"    ✓ {len(owner)} 个 artifactType 无冲突")


def check_tool_names() -> None:
    print("[4] 后端工具命名")
    tools_dir = ROOT / "backend" / "app" / "tools"
    if not tools_dir.exists():
        return
    RE_NAME = re.compile(r"name\s*=\s*['\"]([^'\"]+)['\"]")
    bad = 0
    for d in sorted(p for p in tools_dir.iterdir() if p.is_dir() and not p.name.startswith("_")):
        init = d / "__init__.py"
        if not init.exists():
            problems.append(f"{rel(d)} 缺少 __init__.py → 该工具不会被自动发现")
            bad += 1
            continue
        m = RE_NAME.search(init.read_text(encoding="utf-8", errors="replace"))
        if not m:
            problems.append(f"{rel(init)} 没有导出 TOOL（找不到 name=...）")
            bad += 1
        elif m.group(1) != d.name:
            problems.append(
                f"{rel(init)} 的工具名「{m.group(1)}」与文件夹名「{d.name}」不一致"
                f" → 模型可能调不到"
            )
            bad += 1
    if not bad:
        n = len([p for p in tools_dir.iterdir() if p.is_dir() and not p.name.startswith("_")])
        print(f"    ✓ {n} 个工具命名与目录一致")


def main() -> int:
    print("=" * 62)
    print("边界检查")
    print("=" * 62)
    check_isolation()
    check_registration()
    check_artifact_types()
    check_tool_names()

    print("\n" + "=" * 62)
    if problems:
        print(f"✗ {len(problems)} 处越界或配置错误：\n")
        for p in problems:
            print(f"  - {p}")
        print("\n规则见 协作流程.md 的「三、协作规则」")
        return 1
    print("✓ 全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
