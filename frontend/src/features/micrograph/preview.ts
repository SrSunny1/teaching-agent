/**
 * B2 开发预览数据。
 * 正式数据由 diagnose_micrograph 工具（多模态）下发。
 * 缺陷分类必须来自《教材》实验三给出的封闭清单。
 */
export default {
  imageUrl: '',
  isMicrograph: true,
  confidence: 0.82,
  defects: [
    {
      type: '划痕',
      cause: '抛光不足，上一道工序的磨痕未被消除',
      fix: '延长抛光时间，或更换抛光布与抛光膏',
      textbookStep: '试样的抛光',
    },
    {
      type: '边缘圆角',
      cause: '试样未镶嵌或夹持，制样过程中边缘被磨圆',
      fix: '用环氧树脂或聚乙烯塑料粉镶嵌后重新制样',
      textbookStep: '试样的镶嵌或夹持',
    },
  ],
  summary: '试样存在抛光不足与边缘圆角两处缺陷，建议重新镶嵌后逐级磨抛。',
}
