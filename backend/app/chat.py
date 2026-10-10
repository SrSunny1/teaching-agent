"""
★ Agent 编排循环。

职责：把用户消息交给模型 → 模型决定调用哪些工具 → 执行工具 → 把结果喂回模型 → 直到模型给出最终答案。
每一步都通过 SSE 事件如实上报，前端负责把这些事件画成工具卡片。

输出是 async generator，产出 events.py 里定义的 7 种事件字典之一。
"""
from __future__ import annotations

import json
from typing import Any, AsyncIterator

from openai import AsyncOpenAI

from . import config
from .events import artifact, done, error, thinking, token, tool_call, tool_result
from .tools import TOOLS, specs


async def run_chat(history: list[dict[str, Any]]) -> AsyncIterator[dict]:
    """history 为 [{'role': 'user'|'assistant', 'content': str}, ...]"""

    if not config.API_KEY:
        yield error("未配置 DEEPSEEK_API_KEY。请在 backend/.env 里填写后重启后端。")
        yield done()
        return

    client = AsyncOpenAI(api_key=config.API_KEY, base_url=config.BASE_URL)
    convo: list[dict[str, Any]] = [{"role": "system", "content": config.SYSTEM_PROMPT}, *history]
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
