export const WORKBENCH_FEATURES = [
  {
    id: "documents",
    group: "资料与文档",
    title: "文档管理",
    summary: "导入、阅读、归类、排序和恢复资料，形成可复用的本地文档库。",
    entry: "左侧文档栏",
    action: "documents",
    outputs: ["文档库", "标签", "垃圾箱"],
    mode: "本地优先",
  },
  {
    id: "editor",
    group: "资料与文档",
    title: "正文编辑",
    summary: "在中间编辑区完成正文修订、查找替换、撤销、右键整理和 Word 导出。",
    entry: "中间正文区",
    action: "editor",
    outputs: ["正文", "Word 文档"],
    mode: "本地优先",
  },
  {
    id: "writer-use",
    group: "执笔人",
    title: "使用执笔人",
    summary: "像调用专属写作助手一样使用 @调用名，稳定控制文种结构和表达习惯。",
    entry: "右侧执笔人卡片",
    action: "writer-use",
    outputs: ["@调用名", "规则注入"],
    mode: "核心能力",
  },
  {
    id: "writer-build",
    group: "执笔人",
    title: "生成执笔人",
    summary: "从多篇同类样本文档中提炼结构、文风、禁忌和审稿标准，可重训和测试。",
    entry: "执笔人工作台",
    action: "writer-build",
    outputs: ["说明.md", "规则 JSON", "版本"],
    mode: "AI 构建",
  },
  {
    id: "draft",
    group: "生成与演示",
    title: "AI 起草",
    summary: "输入大段提示词生成新文档，也可以插入或覆盖当前正文，并支持 @执笔人。",
    entry: "右侧生成窗口",
    action: "draft",
    outputs: ["新文档", "插入正文", "覆盖正文"],
    mode: "AI 生成",
  },
  {
    id: "ppt",
    group: "生成与演示",
    title: "PPT 生成",
    summary: "把资料整理为可预览、可编辑、可导出的原生 .pptx 演示稿。",
    entry: "PPT 生成页",
    action: "ppt",
    outputs: ["PPTX", "演讲备注", "预览"],
    mode: "AI 生成",
  },
  {
    id: "cloud-sync",
    group: "云端与商业化",
    title: "云端同步",
    summary: "登录后手动同步文档和执笔人，处理版本冲突，并保留本地优先模式。",
    entry: "云端页",
    action: "cloud-sync",
    outputs: ["云端文档", "云端执笔人"],
    mode: "可选云端",
  },
  {
    id: "billing",
    group: "云端与商业化",
    title: "套餐与充值",
    summary: "查看套餐、额度和费用明细，提交人工充值订单，等待管理员确认到账。",
    entry: "云端页套餐与充值",
    action: "billing",
    outputs: ["充值订单", "额度流水"],
    mode: "灰度可用",
  },
  {
    id: "admin",
    group: "云端与商业化",
    title: "管理员后台",
    summary: "面向 owner/admin，管理成员、接口、用量、审计、反馈、邮件、账单和错误。",
    entry: "admin.html",
    action: "admin",
    outputs: ["运营看板", "审计记录", "审核充值"],
    mode: "管理员",
  },
];

export function getFeatureGroups(features = WORKBENCH_FEATURES) {
  const groups = [];
  const index = new Map();
  features.forEach((feature) => {
    const groupName = feature.group || "其他";
    if (!index.has(groupName)) {
      const group = { name: groupName, features: [] };
      index.set(groupName, group);
      groups.push(group);
    }
    index.get(groupName).features.push(feature);
  });
  return groups;
}

export function getFeatureByAction(action, features = WORKBENCH_FEATURES) {
  return features.find((feature) => feature.action === action) || null;
}
