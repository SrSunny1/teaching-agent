/**
 * B1 开发预览数据。
 * 正式数据由 simulate_heat_treatment 工具下发。
 * ⚠️ 这里只是让 owner 能立刻看到组件效果，数值模型在 model.ts 里。
 */
export default {
  cooling: 'water',
  temperTemp: 200,
  carbon: 0.45,
  structure: '回火马氏体',
  hardnessHrc: 59,
  curve: [
    [150, 60], [200, 59], [250, 57], [300, 52], [350, 48],
    [400, 44], [450, 42], [500, 40], [510, 35], [550, 30], [600, 25],
  ],
  diagnosis:
    '低温回火区间（150–250℃）：降低回火应力、减少脆性，同时保持高硬度。用于切削工具、量具、滚动轴承钢、渗碳钢。',
  warning: null,
}
