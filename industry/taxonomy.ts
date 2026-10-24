// 这个行业的分类体系：类别、标签词表、公司（主体）名录，以及防止张冠李戴的身份词典。
// 模型按这里的词表打标签，主题页（topics.json）按标签归类，筛选栏按类别分组。

export const CATEGORIES = [
  { key: "tip", tagColor: "green", label: "工程实践", feedLabel: "工程实践", section: "架构演进与工程实战", guide: "大厂一线技术团队的工程实践复盘、系统架构改造、性能优化、数据库治理、研发效能、Agent 落地实战与可复用的工程方法。重点是具体可迁移的工程方案与实战经验。", commentary: true },
  { key: "ai-models", tagColor: "indigo", label: "模型与算法", feedLabel: "模型与算法", section: "大模型与算法创新", guide: "大模型、具身智能、多模态、超分音视频、搜索推荐算法本身的发布、架构演进、训练推理优化或评测表现。" },
  { key: "ai-products", tagColor: "turquoise", label: "工具与平台", feedLabel: "工具与平台", section: "开发工具与平台发布", guide: "编程助手、Agent 平台、云原生底座、可观测性组件、数据库中间件、开源框架及开发者工具的发布与实质性技术能力更新（纯价格套餐、促销折扣、常规模型上架或活动预告归入 industry）。" },
  { key: "paper", tagColor: "violet", label: "技术深度", feedLabel: "技术深度", section: "底层原理与深度拆解", guide: "深入剖析底层机制、模型架构演进、论文解读、协议原理、逆向工程或系统性基准实验的深度技术长文。" },
  { key: "industry", tagColor: "orange", label: "周边与快讯", feedLabel: "周边与快讯", section: "生态周边与行业快讯", guide: "产品价格套餐、额度调整、限时折扣、限免活动、训练营、直播预告、技术大会（如 QCon、云栖）、开源赛事、投融资收购、商业合作、政策基金及简讯公告。" },
  { key: "opinion", tagColor: "purple", label: "架构思考", feedLabel: "架构思考", section: "架构视野与工程思考", guide: "技术负责人或资深工程师对研发范式、组织效能、技术选型、架构哲学与行业趋势的系统思考与判断。", commentary: true },
] as const satisfies ReadonlyArray<{ key: string; tagColor: string; label: string; feedLabel?: string; section: string; guide: string; commentary?: true }>;

export const RELEASE: { category: string; tag: string; unit: string } | null = { category: "tip", tag: "教程/实践", unit: "篇工程实战" };

export const PLAIN_TERMS: readonly string[] = ["ai", "api", "llm", "gpu", "agi", "agent", "rag", "mcp", "sdk", "cli", "ide", "k8s", "sql", "rpc"];

export const ITEM_TYPES = ["model_release", "product_launch", "tool_or_prompt", "research_paper", "industry_event", "opinion_analysis", "tutorial_explainer"] as const;

// ── 标签词表 ────────────────────────────────────────────────────────────────────────────

export const CATEGORY_TAGS = [
  "教程/实践", "产品更新", "模型发布", "论文/研究", "开源/仓库", "现象/趋势", "大佬观点", "评测/基准", "安全/对齐", "行业动态", "政策/监管",
  "非AI/通用工具", "其他",
] as const;

export const TOPIC_TAGS = [
  "Agent", "编码", "推理", "多模态", "语音", "视频", "图像生成", "RAG", "端侧", "数据/训练", "搜索", "部署/工程", "开源生态", "具身智能", "MCP/工具调用",
  "后端架构", "云原生", "数据库", "前端与客户端", "研发效能", "可观测性",
] as const;

export const ENTITY_TAGS = [
  "腾讯", "阿里", "字节跳动", "美团", "得物", "快手", "小米", "京东", "vivo", "有赞", "Qoder",
  "OpenAI", "Anthropic", "DeepSeek", "Google", "Meta", "GitHub",
] as const;

export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  "教程/玩法": "教程/实践", "技巧/最佳实践": "教程/实践", "工程实践": "教程/实践", "架构实践": "教程/实践",
  "合作/生态": "行业动态", "融资/收购": "行业动态", "公司动态": "行业动态",
  合作: "行业动态", 生态: "行业动态", 融资: "行业动态", 收购: "行业动态", 投资: "行业动态", 并购: "行业动态",
  政策: "政策/监管", 监管: "政策/监管", 法规: "政策/监管", 安全: "安全/对齐", 对齐: "安全/对齐",
  论文: "论文/研究", 研究: "论文/研究", paper: "论文/研究", papers: "论文/研究", "深度解析": "论文/研究",
  "open-source": "开源/仓库", 开源: "开源/仓库", 仓库: "开源/仓库", repo: "开源/仓库",
  教程: "教程/实践", 玩法: "教程/实践", 指南: "教程/实践", 技巧: "教程/实践", 最佳实践: "教程/实践", 实践: "教程/实践",
  产品: "产品更新", 更新: "产品更新", 发布: "模型发布", 模型: "模型发布", 趋势: "现象/趋势", 现象: "现象/趋势", 观点: "大佬观点",
  视频生成: "视频", 音视频: "视频", 非ai: "非AI/通用工具", "non-ai": "非AI/通用工具", 通用工具: "非AI/通用工具", 工程工具: "非AI/通用工具",
  安全扫描: "非AI/通用工具", devops: "研发效能", 行业: "行业动态", 动态: "行业动态",
  架构: "后端架构", 分布式: "后端架构", 微服务: "后端架构", 存储: "数据库", 分库分表: "数据库",
};

// ── 公司与主体 ──────────────────────────────────────────────────────────────────────────

export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; orgNames?: string[]; otherNames?: string[] }> = {
  tencent: { name: "腾讯技术", displayTag: "腾讯", aliases: ["腾讯", "腾讯技术工程", "腾讯WorkBuddy", "WorkBuddy", "混元", "微信"], orgNames: ["腾讯技术工程", "腾讯WorkBuddy", "腾讯", "Tencent"], otherNames: ["腾讯云", "腾讯混元", "WorkRally"] },
  alibaba: { name: "阿里巴巴 / 淘天 / 云原生", displayTag: "阿里", aliases: ["阿里", "阿里技术", "大淘宝技术", "阿里云", "阿里云云原生", "高德技术", "千问"], orgNames: ["阿里技术", "大淘宝技术", "阿里云云原生", "阿里巴巴", "阿里云", "淘天集团"], otherNames: ["Alibaba", "Taobao"] },
  amap: { name: "高德技术", displayTag: "阿里", aliases: ["高德", "高德技术", "ABot"], orgNames: ["高德技术", "高德地图", "高德"] },
  qwen: { name: "千问 Qwen", displayTag: "阿里", aliases: ["Qwen", "通义", "千问", "千问AI平台"], orgNames: ["千问AI平台", "通义千问", "通义实验室", "Qwen Team", "Qwen"] },
  qoder: { name: "Qoder", displayTag: "Qoder", aliases: ["Qoder"], orgNames: ["Qoder"] },
  bytedance: { name: "字节跳动 / 火山引擎", displayTag: "字节跳动", aliases: ["字节跳动", "字节", "抖音", "火山引擎", "火山方舟", "豆包", "Trae"], orgNames: ["字节跳动技术团队", "火山引擎Agent社区", "字节跳动", "火山引擎", "ByteDance"], otherNames: ["抖音技术", "火山方舟"] },
  meituan: { name: "美团技术团队", displayTag: "美团", aliases: ["美团", "美团技术团队", "LongCat", "大众点评"], orgNames: ["美团技术团队", "美团", "Meituan"] },
  dewu: { name: "得物技术", displayTag: "得物", aliases: ["得物", "得物技术"], orgNames: ["得物技术", "得物"] },
  kuaishou: { name: "快手技术", displayTag: "快手", aliases: ["快手", "快手技术", "可灵", "Kling"], orgNames: ["快手技术", "快手", "Kuaishou"] },
  xiaomi: { name: "小米技术", displayTag: "小米", aliases: ["小米", "小米技术", "MiMo", "澎湃"], orgNames: ["小米技术", "小米", "Xiaomi"] },
  jd: { name: "京东技术 / 京东云", displayTag: "京东", aliases: ["京东", "京东技术", "京东云", "京东云开发者", "JoyCoder"], orgNames: ["京东技术", "京东云开发者", "京东", "京东云", "JD"] },
  vivo: { name: "vivo 互联网技术", displayTag: "vivo", aliases: ["vivo", "vivo互联网技术", "蓝心"], orgNames: ["vivo互联网技术", "vivo"] },
  youzan: { name: "有赞技术", displayTag: "有赞", aliases: ["有赞", "有赞coder", "Youzan"], orgNames: ["有赞coder", "有赞技术", "有赞"] },
  deepseek: { name: "DeepSeek", displayTag: "DeepSeek", aliases: ["DeepSeek", "深度求索"], orgNames: ["DeepSeek", "深度求索"] },
  openai: { name: "OpenAI", displayTag: "OpenAI", aliases: ["OpenAI", "ChatGPT", "Codex", "GPT"], orgNames: ["OpenAI"] },
  anthropic: { name: "Anthropic", displayTag: "Anthropic", aliases: ["Anthropic", "Claude", "Claude Code"], orgNames: ["Anthropic"] },
  google: { name: "Google", displayTag: "Google", aliases: ["Google", "DeepMind", "Gemini", "谷歌"], orgNames: ["Google", "DeepMind", "谷歌"] },
  meta: { name: "Meta", displayTag: "Meta", aliases: ["Meta", "Llama"], orgNames: ["Meta", "Meta AI"] },
};

// 身份词典设为空数组：大厂技术综述常跨厂对比（如腾讯文章对比 BERT、GPT、Claude），不因提及同行公司而丢弃摘要。
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [];

export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "meituan", domains: ["tech.meituan.com"] },
  { entityId: "youzan", domains: ["tech.youzan.com"] },
  { entityId: "qwen", domains: ["qwen.ai"] },
  { entityId: "deepseek", domains: ["deepseek.com"] },
  { entityId: "openai", domains: ["openai.com"] },
  { entityId: "anthropic", domains: ["anthropic.com", "claude.com"] },
];

export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [];
