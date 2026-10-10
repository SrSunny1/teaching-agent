#!/usr/bin/env python3
"""
模块脚手架。因为模块会换，所以换模块这件事必须足够便宜。

    python scripts/module.py list                       # 看现在有哪些模块
    python scripts/module.py new <名> --title "显示名" --artifact <类型> [--tool <工具名>] [--order 50]
    python scripts/module.py rm <名>                    # 删掉模块骨架

`new` 会生成前端三个文件（index.ts / Component.tsx / preview.ts），
给了 `--tool` 就再生成一个后端工具（tools/<工具名>/__init__.py）。
生成完**不需要改任何公共文件** —— 自动注册会接上。

`rm` 只删骨架，不会动你已经写进去的代码之外的东西；它会告诉你还剩哪些地方要手工清理。
"""
# ─────────────────────────────────────────────────────────────
# ★ 控制台输出只用 GBK 能编码的符号：√（通过）和 ×（失败）。
#   不要改成 ✓ ✗ —— 它们在 GBK 里不存在（U+2713 / U+2717）。
#   Windows 中文控制台默认 cp936，一旦输出被重定向（管道/存文件/agent 抓取），
#   Python 会用 cp936 编码 stdout，遇到编不了的字符直接抛 UnicodeEncodeError 崩掉。
#   在 Windows 上实测过：✓ → exit=1 + UnicodeEncodeError；√ → exit=0。
# ─────────────────────────────────────────────────────────────

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FEATURES = ROOT / "frontend" / "src" / "features"
TOOLS = ROOT / "backend" / "app" / "tools"

NAME_RE = re.compile(r"^[a-z][a-zA-Z0-9_]*$")


# ── 读取现有模块 ────────────────────────────────────────

def existing() -> list[dict]:
    out = []
    if not FEATURES.exists():
        return out
    for d in sorted(p for p in FEATURES.iterdir() if p.is_dir()):
        idx = d / "index.ts"
        title, types, order = "?", [], 999
        if idx.exists():
            s = idx.read_text(encoding="utf-8", errors="replace")
            m = re.search(r"title:\s*'([^']*)'", s)
            if m:
                title = m.group(1)
            m = re.search(r"artifactTypes:\s*\[([^\]]*)\]", s)
            if m:
                types = re.findall(r"['\"]([^'\"]+)['\"]", m.group(1))
            m = re.search(r"order:\s*(\d+)", s)
            if m:
                order = int(m.group(1))
        out.append({"id": d.name, "title": title, "types": types, "order": order})
    return sorted(out, key=lambda x: x["order"])


def used_types() -> dict[str, str]:
    owner: dict[str, str] = {}
    for m in existing():
        for t in m["types"]:
            owner[t] = m["id"]
    return owner


# ── 模板 ──────────────────────────────────────────────

INDEX_TPL = """// backend-tool: {toolname}
import type {{ FeatureModule }} from '../../lib/types'
import Component from './Component'
import preview from './preview'

const feature: FeatureModule = {{
  id: '{name}',
  title: '{title}',
  // 这个模块负责渲染哪些 artifactType。后端产出同名类型时就会挂到这块画布。
  // ★ 类型名全局唯一，换名字前先跑 `python scripts/module.py list` 看看有没撞车。
  artifactTypes: [{types}],
  order: {order},
  // 左栏点进来时用 preview 渲染，方便你单独看效果（画布会标注「预览数据」）。
  // 改 preview.ts 就能换样例数据，不需要后端、不需要 API Key。
  preview,
  Component,
}}

export default feature
"""

# 上面第一行 `// backend-tool: xxx` 是给 `module.py rm` 用的：
# 删模块时要连后端工具一起删，而工具名不一定等于模块名，所以记在这里。
RE_TOOLMARK = re.compile(r"^//\s*backend-tool:\s*(\S+)\s*$", re.M)

COMPONENT_TPL = """import type {{ FeatureProps }} from '../../lib/types'

/**
 * {title}（{name}）
 *
 * ★ 这是脚手架生成的占位实现，请替换。
 *
 * 怎么写，参考 features/heatTreatment/ —— 那是全项目的样板：
 *   1. 从 props.artifact?.data 读数据
 *   2. 本地交互即时反馈，不要自己发网络请求
 *   3. 需要 Agent 干活时调 props.onSendMessage()
 *   4. 要把新状态推给画布时调 props.onEmitArtifact()
 *
 * 数据形状由你自己定，定好后写进 README.md 第三节的契约表，并告诉其他人。
 */
export default function Component({{ artifact }}: FeatureProps) {{
  const data = artifact?.data

  return (
    <div className="feat">
      <h3>{title}</h3>
      <div className="sub">脚手架生成的占位 —— 待实现</div>

      {{!data && (
        <div className="box">
          在对话里提问，Agent 调到你的工具后，结果会显示在这里
        </div>
      )}}

      {{data ? (
        <>
          <div className="sub" style={{{{ marginBottom: 6 }}}}>
            当前产物（占位渲染，替换成真实可视化）
          </div>
          <pre className="raw">{{JSON.stringify(data, null, 2)}}</pre>
        </>
      ) : null}}
    </div>
  )
}}
"""

PREVIEW_TPL = """/**
 * {title} —— 开发预览数据。
 *
 * 在左栏点这个模块时，画布就用这份数据渲染，**不需要后端、不需要 API Key**。
 * 做组件时先改这里，改完存盘浏览器自动刷新，立刻能看到效果。
 */
export default {{
  // TODO: 换成你这个模块真实的数据形状
  placeholder: true,
  note: '{title} 的样例数据，请在 preview.ts 里替换',
}}
"""

TOOL_TPL = """\"\"\"
{title} 的后端工具。

自动发现：只要这个文件夹里导出 TOOL，就会被 app/tools/__init__.py 扫到，
**不需要改任何注册表文件**。工具名必须等于文件夹名 `{tool}`。
\"\"\"
from __future__ import annotations

from ..base import Tool, ToolResult


async def _run(args: dict) -> ToolResult:
    # TODO: 实现你的逻辑
    return ToolResult(
        summary="占位：还没实现",
        detail="这个工具是脚手架生成的，请替换成真实实现。",
        # 需要挂到右栏画布时打开下面两行，artifact_type 要和前端 index.ts 里的一致
        # artifact_type="{artifact}",
        # artifact={{"placeholder": True}},
    )


TOOL = Tool(
    name="{tool}",                       # 必须等于文件夹名
    label="{title} · {{参数名}}",          # 对话里工具卡片的展示文案
    description=(
        "给模型看的功能说明。写得越清楚，模型越知道什么时候该调这个工具。"
        "学生问什么问题时应该调它，写在这里。"
    ),
    parameters={{
        "type": "object",
        "properties": {{
            "query": {{"type": "string", "description": "参数说明"}},
        }},
        "required": ["query"],
    }},
    run=_run,
)
"""


# ── 命令 ──────────────────────────────────────────────

def cmd_list(_args) -> int:
    mods = existing()
    if not mods:
        print("还没有任何模块。用 `python scripts/module.py new ...` 建一个。")
        return 0
    print(f"{'顺序':<6}{'文件夹':<18}{'标题':<22}artifactType")
    print("-" * 70)
    for m in mods:
        print(f"{m['order']:<6}{m['id']:<18}{m['title']:<22}{'、'.join(m['types']) or '（无）'}")
    print()
    print(f"共 {len(mods)} 个模块")
    return 0


def cmd_new(args) -> int:
    name = args.name
    if not NAME_RE.match(name):
        print(f"× 名字「{name}」不合法。要求：小写字母开头，只含字母/数字/下划线，例如 structure3d")
        return 1

    feat_dir = FEATURES / name
    if feat_dir.exists():
        print(f"× 模块「{name}」已存在：{feat_dir}")
        return 1

    types = args.artifact or [name]
    owner = used_types()
    clash = [t for t in types if t in owner]
    if clash:
        print(f"× artifactType {clash} 已被占用：")
        for t in clash:
            print(f"    {t} → 模块 {owner[t]}")
        print("  换个名字，或先删掉冲突的模块。")
        return 1

    # 前端
    feat_dir.mkdir(parents=True)
    types_lit = ", ".join(f"'{t}'" for t in types)
    (feat_dir / "index.ts").write_text(
        INDEX_TPL.format(name=name, title=args.title, types=types_lit,
                         order=args.order, toolname=args.tool or "-"),
        encoding="utf-8")
    (feat_dir / "Component.tsx").write_text(
        COMPONENT_TPL.format(name=name, title=args.title), encoding="utf-8")
    (feat_dir / "preview.ts").write_text(
        PREVIEW_TPL.format(title=args.title), encoding="utf-8")
    print(f"  √ frontend/src/features/{name}/  (index.ts + Component.tsx + preview.ts)")

    # 后端（可选）
    if args.tool:
        tool_dir = TOOLS / args.tool
        if tool_dir.exists():
            print(f"  ! 工具目录已存在，跳过：{tool_dir}")
        else:
            tool_dir.mkdir(parents=True)
            (tool_dir / "__init__.py").write_text(
                TOOL_TPL.format(title=args.title, tool=args.tool, artifact=types[0]),
                encoding="utf-8")
            print(f"  √ backend/app/tools/{args.tool}/__init__.py")

    print()
    print("接下来：")
    print(f"  1. 改 frontend/src/features/{name}/preview.ts 的样例数据")
    print(f"     → 存盘，浏览器自动刷新，点左栏就能看到你的模块")
    print(f"  2. 改 Component.tsx 做真正的渲染（参考 features/heatTreatment/）")
    if args.tool:
        print(f"  3. 实现 backend/app/tools/{args.tool}/__init__.py 的逻辑")
    print(f"  4. 把自己加进 CODEOWNERS")
    print(f"  5. python scripts/check-boundaries.py   ← 确认没越界")
    return 0


def _find_tool(name: str, types: list[str], marked: str | None) -> str | None:
    """定位这个模块的后端工具目录名。

    优先用 index.ts 里记的 `// backend-tool: xxx`；
    没有标记（老模块）就退回到「哪个工具的 artifact_type 指向本模块的某个类型」。
    """
    if not TOOLS.exists():
        return None

    if marked and marked != "-" and (TOOLS / marked).is_dir():
        return marked

    for d in sorted(p for p in TOOLS.iterdir() if p.is_dir() and not p.name.startswith("_")):
        init = d / "__init__.py"
        if not init.exists():
            continue
        s = init.read_text(encoding="utf-8", errors="replace")
        for t in types:
            if f'artifact_type="{t}"' in s or f"artifact_type='{t}'" in s:
                return d.name
    return None


def cmd_rm(args) -> int:
    name = args.name
    feat_dir = FEATURES / name
    if not feat_dir.exists():
        print(f"× 没有模块「{name}」")
        return 1

    # 删之前先把要连带删掉的东西查清楚
    types: list[str] = []
    marked: str | None = None
    idx = feat_dir / "index.ts"
    if idx.exists():
        s = idx.read_text(encoding="utf-8", errors="replace")
        m = re.search(r"artifactTypes:\s*\[([^\]]*)\]", s)
        if m:
            types = re.findall(r"['\"]([^'\"]+)['\"]", m.group(1))
        m = RE_TOOLMARK.search(s)
        if m:
            marked = m.group(1)

    tool = _find_tool(name, types, marked)

    if not args.yes:
        print(f"将删除：")
        print(f"  frontend/src/features/{name}/")
        if tool:
            print(f"  backend/app/tools/{tool}/")
        else:
            print(f"  （没找到配套的后端工具）")
        print(f"它注册的 artifactType：{'、'.join(types) or '（无）'}")
        print()
        print("确认请加 --yes")
        return 1

    shutil.rmtree(feat_dir)
    print(f"  √ 已删除 frontend/src/features/{name}/")

    if tool:
        shutil.rmtree(TOOLS / tool)
        print(f"  √ 已删除 backend/app/tools/{tool}/")
    else:
        print(f"  ! 没找到配套的后端工具。如果确实有，请手工删 backend/app/tools/ 下对应目录")

    # 剩下的残留只能提示，不好自动改（怕误伤）
    leftovers = []
    if types:
        mock = ROOT / "frontend" / "src" / "lib" / "mock.ts"
        if mock.exists():
            s = mock.read_text(encoding="utf-8", errors="replace")
            if any(f"'{t}'" in s for t in types):
                leftovers.append("frontend/src/lib/mock.ts 里有这个 artifactType")
        for f in ("README.md", "AGENTS.md"):
            p = ROOT / f
            if p.exists() and any(t in p.read_text(encoding="utf-8", errors="replace") for t in types):
                leftovers.append(f"{f} 的契约表里还列着它")
        p = ROOT / "CODEOWNERS"
        if p.exists() and name in p.read_text(encoding="utf-8", errors="replace"):
            leftovers.append("CODEOWNERS 里还有它的路径")

    if leftovers:
        print()
        print("还需手工清理（脚本不敢自动改，怕误伤）：")
        for l in leftovers:
            print(f"  - {l}")

    print()
    print("跑一下 python scripts/check-boundaries.py 确认干净了。")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="模块脚手架")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_list = sub.add_parser("list", help="列出所有模块")
    p_list.set_defaults(func=cmd_list)

    p_new = sub.add_parser("new", help="新建模块骨架")
    p_new.add_argument("name", help="文件夹名，小写字母开头，如 structure3d")
    p_new.add_argument("--title", required=True, help="左栏显示名，如「材料结构 3D 可视化」")
    p_new.add_argument("--artifact", action="append",
                       help="artifactType，可给多个。不给就用模块名")
    p_new.add_argument("--tool", help="同时生成后端工具，参数是工具文件夹名")
    p_new.add_argument("--order", type=int, default=99, help="左栏排序，小的在前，默认 99")
    p_new.set_defaults(func=cmd_new)

    p_rm = sub.add_parser("rm", help="删除模块骨架")
    p_rm.add_argument("name")
    p_rm.add_argument("--yes", action="store_true", help="确认删除")
    p_rm.set_defaults(func=cmd_rm)

    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
