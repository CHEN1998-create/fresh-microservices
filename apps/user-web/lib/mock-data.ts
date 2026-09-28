import type { Product } from './api';

// 后端服务未启动时的兜底数据，保证前端骨架可独立浏览
export const mockProducts: Product[] = [
  {
    id: 'p-tomato',
    name: '有机番茄',
    category: '蔬菜',
    priceCents: 890,
    status: 'on',
    emoji: '🍅',
    description: '自然成熟，沙瓤多汁，约 500g/份',
  },
  {
    id: 'p-cucumber',
    name: '旱黄瓜',
    category: '蔬菜',
    priceCents: 590,
    status: 'on',
    emoji: '🥒',
    description: '顶花带刺，清脆爽口，约 500g/份',
  },
  {
    id: 'p-egg',
    name: '散养鸡蛋（10 枚）',
    category: '肉蛋',
    priceCents: 1580,
    status: 'on',
    emoji: '🥚',
    description: '谷饲散养，蛋黄饱满，55g±5g/枚',
  },
  {
    id: 'p-milk',
    name: '鲜牛奶 950ml',
    category: '乳品',
    priceCents: 2200,
    status: 'on',
    emoji: '🥛',
    description: '当日巴氏杀菌，冷链配送',
  },
  {
    id: 'p-apple',
    name: '红富士苹果',
    category: '水果',
    priceCents: 1290,
    status: 'on',
    emoji: '🍎',
    description: '脆甜多汁，果径 80mm+，约 4 粒/份',
  },
  {
    id: 'p-salmon',
    name: '挪威三文鱼刺身',
    category: '肉蛋',
    priceCents: 6800,
    status: 'on',
    emoji: '🐟',
    description: '冰鲜空运，刺身级，约 200g/份',
  },
];
