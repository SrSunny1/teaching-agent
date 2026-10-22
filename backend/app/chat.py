"""
★ Agent 编排循环。

职责：把用户消息交给模型 → 模型决定调用哪些工具 → 执行工具 → 把结果喂回模型 → 直到模型给出最终答案。
每一步都通过 SSE 事件如实上报，前端负责把这些事件画成工具卡片。

输出是 async generator，产出 events.py 里定义的 7 种事件字典之一。
"""
from __future__ import annotations

import json
import re
from typing import Any, AsyncIterator

from openai import AsyncOpenAI

from . import config
from .events import artifact, done, error, thinking, token, tool_call, tool_result
from .tools import TOOLS, specs

# ★ 复用 AsyncOpenAI 客户端（底层 httpx 连接池），避免每轮对话重新 TLS 握手。
#   缓存 key 带上 AsyncOpenAI 类本身：test_smoke.py 会 monkeypatch `chat.AsyncOpenAI = _Client`，
#   类对象一变就自动重建，不会把真实客户端漏进单测（反之亦然）。
_client_cache: tuple[Any, str, str, Any] | None = None


def _get_client() -> Any:
    global _client_cache
    key = (AsyncOpenAI, config.API_KEY, config.BASE_URL)
    if _client_cache is None or _client_cache[:3] != key:
        _client_cache = (*key, AsyncOpenAI(api_key=config.API_KEY, base_url=config.BASE_URL))
    return _client_cache[3]


def _system_prompt(feature: dict[str, Any] | None) -> str:
    """系统提示词 = 全局角色 + 「当前在哪个功能模块」。

    ★ 为什么要有这一段：模型只能看到系统提示词，看不到界面。
      不告诉它「用户此刻点的是费曼追问模块」，它就只能笼统回答「我是教学智能体」，
      学生问「你负责什么」时答不出自己在这个模块里的职责。

    ★ 为什么写成「你在哪儿 / 职责由谁承担」，而不是直接来一句「你是 XX 子智能体」：
      上面 config.SYSTEM_PROMPT 第一句已经定义过一次身份了。再声明一个身份，
      模型面前就有**两个互相竞争的身份声明** —— 它可能二选一、可能两个都报、
      也可能仍以第一句为主语，表现不稳定。所以这里只声明位置与职责，并**教它怎么答**。

    ★ 全局对话（feature 为空）**提前返回 config.SYSTEM_PROMPT 本身**：
      既保证与加这个功能之前逐字一致，也让 SYSTEM_PROMPT 永远是提示词的不变前缀
      （前缀式提示词缓存不会因为切模块而整体失效）。
    """
    title = ((feature or {}).get("title") or "").strip()
    persona = ((feature or {}).get("persona") or "").strip()
    if not title:
        return config.SYSTEM_PROMPT

    if persona:
        # ★ 用 f-string 拼接，不要对 persona 调 .format() —— 它里面如果含 {} 会抛异常
        #   （base.py 的 render_label 就是为这个加的 try/except）。
        body = (
            f"本次对话在【{title}】模块中进行。\n"
            f"本模块中你承担的具体职责：{persona}\n\n"
            f"若被问到「你负责什么 / 你在做什么」，如实回答：你是本课程的教学智能体，"
            f"当前位于【{title}】模块，在该模块中负责上述职责 —— "
            f"不要只笼统回答「我是教学智能体」。"
        )
    else:
        # 模块还没写 persona（比如模块 1~4 刚建好）。宁可知不知道，也别让它编。
        body = (
            f"本次对话在【{title}】模块中进行。\n"
            f"该模块的具体职责尚未配置 —— 被问到时就如实说明你正在该模块中与用户对话，"
            f"不要编造这个模块有哪些功能。"
        )

    return (
        config.SYSTEM_PROMPT
        + "\n\n## 当前模块（补充信息）\n\n"
        + body
        + "\n\n★ 本段只是补充说明你的职责范围。它与上面的「知识边界」「硬性要求」冲突时，"
        + "一律以上面为准；本段不扩大你的知识边界，也不豁免任何溯源要求。\n"
    )


def _requested_structure(history: list[dict[str, Any]]) -> str | None:
    """从最新用户请求中提取明确指定的晶体结构，避免工具参数与请求不一致。"""
    latest_user = next(
        (str(message.get("content") or "") for message in reversed(history) if message.get("role") == "user"),
        "",
    )
    if not latest_user:
        return None

    patterns = {
        "sc": ("简单立方", r"(?<![a-z0-9])sc(?![a-z0-9])"),
        "bcc": ("体心立方", r"(?<![a-z0-9])bcc(?![a-z0-9])"),
        "fcc": ("面心立方", r"(?<![a-z0-9])fcc(?![a-z0-9])"),
        "hcp": ("密排六方", "六方密排", r"(?<![a-z0-9])hcp(?![a-z0-9])"),
    }

    def mentions(text: str) -> set[str]:
        return {
            structure
            for structure, aliases in patterns.items()
            if any(re.search(alias, text, re.IGNORECASE) for alias in aliases)
        }

    # 对“我要 BCC，但画布显示 SC”这类纠错请求，采用转折前明确要求的目标。
    requested_part = re.split(r"但|可是|然而|不过|却|而不是|instead of|rather than|\bbut\b", latest_user, maxsplit=1, flags=re.IGNORECASE)[0]
    requested = mentions(requested_part)
    if len(requested) == 1 and re.search(r"可视化|渲染|加载|展示|显示|模型|晶胞", requested_part):
        return next(iter(requested))

    all_mentions = mentions(latest_user)
    return next(iter(all_mentions)) if len(all_mentions) == 1 else None


async def run_chat(
    history: list[dict[str, Any]], feature: dict[str, Any] | None = None
) -> AsyncIterator[dict]:
    """history 为 [{'role': 'user'|'assistant', 'content': str}, ...]

    feature 为当前对话所属的功能模块 {id, title, persona}，全局对话传 None。

    ★ 参数必须**可选**且排在 history **之后** —— backend/tests/test_smoke.py 是
      位置传参 `chat.run_chat([{...}])`、只给一个实参，签名一动它就崩。
    """

    if not config.has_api_key():
        if config.API_KEY.strip():
            # 填了但看着是占位符 —— 单独提示，否则人会以为「我明明填了啊」
            yield error(
                "backend/.env 里的 DEEPSEEK_API_KEY 看着还是个占位符（sk-xxxx…），"
                "不是真实 Key。请去 platform.deepseek.com 申请一个填进去，然后重启后端。"
            )
        else:
            yield error("未配置 DEEPSEEK_API_KEY。请在 backend/.env 里填写后重启后端。")
        yield done()
        return

    client = _get_client()

    # ★ 图片链路：前端把图片（data URL）挂在最后一条 user 消息的 image 上。
    #   聊天模型是**纯文本**的 —— 所以这里分两件事做：
    #     ① 交给模型的 messages 只保留 role/content。直接把 image 塞进去会被 API 拒掉；
    #     ② 提示模型「这一轮带了图」，否则它不知道有图，根本不会去调诊断工具；
    #     ③ 图片本身单独拎出来，等它真的调用 diagnose_micrograph 时再填进工具参数
    #        （见下面 attached_image 那段，和 _requested_structure 是同一个套路）。
    attached_image = next(
        (
            str(msg["image"])
            for msg in reversed(history)
            if msg.get("role") == "user" and msg.get("image")
        ),
        "",
    )

    convo: list[dict[str, Any]] = [{"role": "system", "content": _system_prompt(feature)}]
    for index, msg in enumerate(history):
        content = msg.get("content") or ""
        if attached_image and index == len(history) - 1:
            content += (
                "\n\n（本次消息附带了一张图片。涉及金相组织、试样表面等图像内容的问题，"
                "请调用 diagnose_micrograph；图片由系统随请求提供，不需要再向用户索要。）"
            )
        convo.append({"role": msg.get("role", "user"), "content": content})

    tool_specs = specs()

    try:
        for turn in range(config.MAX_TURNS):
            stream = await client.chat.completions.create(
                model=config.MODEL,
                messages=convo,
                tools=tool_specs or None,
                stream=True,
            )

            content_parts: list[str] = []
            # index -> {id, name, args}，流式返回的工具调用需要按 index 拼接
            calls: dict[int, dict[str, str]] = {}

            async for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta

                # deepseek-reasoner 会返回 reasoning_content；普通模型没有，跳过
                reasoning = getattr(delta, "reasoning_content", None)
                if reasoning:
                    yield thinking(reasoning)

                if delta.content:
                    content_parts.append(delta.content)
                    yield token(delta.content)

                for tc in delta.tool_calls or []:
                    slot = calls.setdefault(tc.index, {"id": "", "name": "", "args": ""})
                    if tc.id:
                        slot["id"] = tc.id
                    if tc.function:
                        # 工具名：取**首个非空值**，忽略后续重复。
                        # OpenAI / DeepSeek 只在首个分片把完整名字给一次，
                        # 但个别供应商每片都带名字 —— 用赋值会丢，用 += 会拼出重复串，
                        # 所以这里只认第一个，两种行为都能兼容。
                        if tc.function.name and not slot["name"]:
                            slot["name"] = tc.function.name
                        # 参数：必须累加，它是真的一段一段流过来的
                        if tc.function.arguments:
                            slot["args"] += tc.function.arguments

            content = "".join(content_parts)

            # 没有工具调用 → 模型回答完毕
            if not calls:
                break

            ordered = [calls[i] for i in sorted(calls)]

            requested_structure = _requested_structure(history)
            for slot in ordered:
                if slot["name"] != "load_structure" or not requested_structure:
                    continue
                try:
                    args = json.loads(slot["args"] or "{}")
                except json.JSONDecodeError:
                    args = {}
                if isinstance(args, dict):
                    args["structure"] = requested_structure
                    slot["args"] = json.dumps(args, ensure_ascii=False)

            # 图片同理：模型看不到图，但它能决定「调诊断工具」。图片是前端带上来的，
            # 这里替它填进工具参数 —— 模型既不需要、也不可能自己生成这串 base64。
            if attached_image:
                for slot in ordered:
                    if slot["name"] != "diagnose_micrograph":
                        continue
                    try:
                        args = json.loads(slot["args"] or "{}")
                    except json.JSONDecodeError:
                        args = {}
                    if isinstance(args, dict):
                        args["image"] = attached_image
                        slot["args"] = json.dumps(args, ensure_ascii=False)

            # 把 assistant 这一轮的 tool_calls 记进上下文，否则下一轮模型不知道发生过什么
            convo.append(
                {
                    "role": "assistant",
                    "content": content or None,
                    "tool_calls": [
                        {
                            "id": s["id"],
                            "type": "function",
                            "function": {"name": s["name"], "arguments": s["args"]},
                        }
                        for s in ordered
                    ],
                }
            )

            for slot in ordered:
                tool = TOOLS.get(slot["name"])
                try:
                    args = json.loads(slot["args"] or "{}")
                except json.JSONDecodeError:
                    args = {}

                yield tool_call(
                    slot["id"],
                    slot["name"],
                    tool.render_label(args) if tool else slot["name"],
                    args,
                )

                if tool is None:
                    msg = f"没有名为 {slot['name']} 的工具。"
                    yield tool_result(slot["id"], "未知工具", msg)
                    convo.append({"role": "tool", "tool_call_id": slot["id"], "content": msg})
                    continue

                try:
                    result = await tool.run(args)
                except Exception as exc:  # 工具挂了不能让整条流断掉
                    msg = f"{type(exc).__name__}: {exc}"
                    yield tool_result(slot["id"], "执行失败", msg)
                    convo.append({"role": "tool", "tool_call_id": slot["id"], "content": f"工具执行失败：{msg}"})
                    continue

                yield tool_result(slot["id"], result.summary, result.detail)
                if result.artifact_type is not None:
                    yield artifact(result.artifact_type, result.artifact)

                convo.append(
                    {
                        "role": "tool",
                        "tool_call_id": slot["id"],
                        "content": result.detail or result.summary,
                    }
                )
        else:
            yield error(f"已达到最大工具调用轮数（{config.MAX_TURNS}），中止本轮。")

    except Exception as exc:
        yield error(f"{type(exc).__name__}: {exc}")
    finally:
        yield done()
