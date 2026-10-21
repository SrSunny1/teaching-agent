import { useState } from 'react'
import { qaData, qaSources } from './qaData'

export default function QuestionAnswer({ onSendMessage, busy }: { onSendMessage: (text: string) => void; busy?: boolean }) {
  const [sent, setSent] = useState('')
  return <div className="m4-knowledge">
    <h4>实验四常见问题</h4>
    <p className="sub">{qaData.length} 条参考问答 · 课件整理与网络补充 · 待教师审核</p>
    <ul>{qaData.map(entry => <li key={entry.id}><button className="m4-question" disabled={busy} onClick={() => { onSendMessage(entry.question); setSent(entry.question) }}>{entry.question}</button></li>)}</ul>
    {sent && <p role="status">已发送到对话区：{sent}</p>}
    <details><summary>引用资料</summary><ul>{Object.entries(qaSources).map(([id, source]) => <li key={id}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : source.title} · {source.location}</li>)}</ul></details>
    <details><summary>资料覆盖与限制</summary><p>当前资料使用课件第2、5至8、19页可提取文字。图片为主的页面尚未逐图审核；铝硅合金、铜合金具体组织和显微镜操作步骤暂未建立答案。课件个别温度表述不一致，不提供相关工艺参数建议。</p><p>精确问题及已收录的同义问法由本地资料回答。未命中时，有后端模型则继续课程检索；无后端则只列相关问题，不自动拼接答案。</p></details>
  </div>
}
