# cocoHot（大厂技术热榜）项目路径、架构与运维手册

本文档记录 `cocoHot`（基于 `AIHOT` 二次开发的大厂技术公众号精选与站内全文解析站）的代码路径、服务器部署拓扑、域名与证书配置、19 个技术信源清单，以及文章从「拉取 → 正文解析 → AI 导读 → 站内展示与配图反防盗链」的完整链路。

---

## 一、项目路径与部署拓扑总览

| 环境 / 组件 | 路径 / 地址 | 说明 |
|---|---|---|
| **本地源码目录** | `/Users/mac/Code/AIHOT` | 本地开发、构建与测试主目录 |
| **本地数据库** | `postgres://localhost:5432/techdigest` | 本地 PostgreSQL 数据库（含 64 个迁移表） |
| **线上服务器** | `106.53.113.137`（SSH 端口 `2222`） | 腾讯云 OpenCloudOS Linux（密钥 `~/.ssh/resume_deploy`） |
| **线上应用目录** | `/opt/tech-digest` | 线上代码、构建产物与 `.env` 所在目录 |
| **线上 Node 运行时** | `/opt/node24/bin/node`（`v24.11.0`） | 原生支持 TypeScript 执行的 Node.js 24 运行时 |
| **线上数据库** | `postgres://postgres@127.0.0.1:5432/techdigest` | 服务器本机 PostgreSQL 15 数据库 `techdigest` |
| **API 服务** | `techdigest-api.service`（`127.0.0.1:3001`） | Fastify 后端 API、搜索、MCP 与 `/api/img-proxy` 图片代理 |
| **Web SSR 服务** | `techdigest-web.service`（`127.0.0.1:3002`） | React Router v7 服务端渲染（SSR）与静态资源服务 |
| **Worker 调度服务** | `techdigest-worker.service` | `pg-boss` 定时采集、正文解析、大模型评测、聚簇与日报生成 |

---

## 二、域名、DNS 与 Nginx 路由配置

1. **对外展示域名**：**[https://tech.resumegenkk.xyz/](https://tech.resumegenkk.xyz/)**
   - **DNS 解析**：腾讯云 DNSPod（`resumegenkk.xyz`）下 `tech` 主机记录（`A` 记录 -> `106.53.113.137`）。
   - **Nginx 配置文件**：`/www/server/panel/vhost/nginx/tech.resumegenkk.xyz.conf`
     - `80` 端口保留 `/.well-known/acme-challenge/` 供证书续期，其余请求 `301` 跳转至 `https://tech.resumegenkk.xyz$request_uri`。
     - `443` 端口反代至本机 `http://127.0.0.1:3002`（`techdigest-web`）。
   - **HTTPS 证书**：`/etc/letsencrypt/live/tech.resumegenkk.xyz/fullchain.pem`（Let's Encrypt ECDSA 证书，由系统 `certbot.timer` 自动续期）。
2. **主域名隔离**：
   - `https://resumegenkk.xyz/` 对应的 Nginx 配置 `/www/server/panel/vhost/nginx/resumegenkk-shared.conf` 中，`location /` 固定返回 `204 No Content`，主域名不展示任何页面内容，仅 `tech.resumegenkk.xyz` 对外提供 `cocoHot` 内容。

---

## 三、背后的信源清单（18 家大厂公众号 + 美团技术 RSS + 6 个 OpenAI / Claude 官方一手信源）

所有初始信源定义在 [`industry/sources.json`](../industry/sources.json)，通过 `node --env-file=.env scripts/seed.ts` 同步到数据库 `sources` 表，且全部开启 `site_fulltext: true`（允许站内全文展示）：

| 序号 | 信源 ID (`id`) | 名称 (`name`) | 类型 (`kind`) | 采集标识 (`mpId` / `url`) | 微信公众号原始 ID / 说明 |
|---|---|---|---|---|---|
| 1 | `mp-tencent-tech` | 腾讯技术工程 | `mp` | `MP_WXS_2399152940` | `gh_68295cd977b1` |
| 2 | `mp-ali-tech` | 阿里技术 | `mp` | `MP_WXS_3562357500` | `gh_01233f4a1994` |
| 3 | `mp-taobao-tech` | 大淘宝技术 | `mp` | `MP_WXS_3920042617` | `gh_e9b89be5fb71` |
| 4 | `mp-amap-tech` | 高德技术 | `mp` | `MP_WXS_3569959656` | `gh_9440f258f999` |
| 5 | `mp-qwen-ai` | 千问AI平台 | `mp` | `MP_WXS_3892427646` | `gh_a5cefc2f648e` |
| 6 | `mp-qoder` | Qoder | `mp` | `MP_WXS_3914981697` | `gh_fd25dcd0ace4` |
| 7 | `mp-dewu-tech` | 得物技术 | `mp` | `MP_WXS_3875429211` | `gh_83cab26fd521` |
| 8 | `mp-meituan-tech` | 美团技术团队 | `mp` | `MP_WXS_3000285051` | `gh_f48f5c93b8f8` |
| 9 | `mp-bytedance-tech` | 字节跳动技术团队 | `mp` | `MP_WXS_3577562679` | `gh_61b5b8ab83bc` |
| 10 | `mp-volcengine-agent` | 火山引擎Agent社区 | `mp` | `MP_WXS_3902821955` | `gh_d26669a30ab1` |
| 11 | `mp-kuaishou-tech` | 快手技术 | `mp` | `MP_WXS_3529158970` | `gh_f3e8c07db359` |
| 12 | `mp-xiaomi-tech` | 小米技术 | `mp` | `MP_WXS_3867787039` | `gh_81b4ed5d5f47` |
| 13 | `mp-jd-tech` | 京东技术 | `mp` | `MP_WXS_3256862141` | `gh_0758cd79fb09` |
| 14 | `mp-jdcloud-dev` | 京东云开发者 | `mp` | `MP_WXS_3559132279` | `gh_143a2dc8105a` |
| 15 | `mp-vivo-tech` | vivo互联网技术 | `mp` | `MP_WXS_3582504065` | `gh_28ff7f1cabcf` |
| 16 | `mp-youzan-coder` | 有赞coder | `mp` | `MP_WXS_3233095838` | `gh_d82ffaf1fa8a` |
| 17 | `mp-tencent-workbuddy` | 腾讯WorkBuddy | `mp` | `MP_WXS_3935933737` | `gh_99d04200690f` |
| 18 | `mp-aliyun-cloudnative` | 阿里云云原生 | `mp` | `MP_WXS_3562266656` | `gh_2c5fd2c55767` |
| 19 | `rss-meituan-tech` | 美团技术团队博客 | `rss` | `https://tech.meituan.com/rss.xml` | 官方技术博客 RSS |
| 20 | `rss-claude-dev` | Claude Developer Blog | `rss` | `https://claude.dev/rss.xml` | Claude 开发者工程博客 RSS（`T1`） |
| 21 | `web-anthropic-engineering` | Anthropic Engineering | `web_list` | `https://www.anthropic.com/engineering` | Anthropic 官方工程长文列表（`T1`） |
| 22 | `web-claude-blog` | Claude Blog | `web_list` | `https://claude.com/resources/articles` | Claude 产品与技术博客列表（`T1`） |
| 23 | `web-anthropic-news` | Anthropic News | `web_list` | `https://www.anthropic.com/news` | Anthropic 官方动态与发布（`T1`） |
| 24 | `rss-openai-news` | OpenAI News | `rss` | `https://openai.com/news/rss.xml` | OpenAI 官方动态与研究博客 RSS（`T1`） |
| 25 | `rss-openai-devs` | OpenAI Developers | `rss` | `https://developers.openai.com/rss.xml` | OpenAI 开发者博客与更新 RSS（`T1`） |

**决策记录（2026-10-21 接入 OpenAI 与 Claude / Anthropic 官方一手 T1 信源）**：
- **拍板内容**：将上述 6 个 OpenAI 与 Claude / Anthropic 官方一手渠道（3 个 `rss` + 3 个 `web_list`）作为 `T1` 级 `first_party = true` 信源接入，开启 `site_fulltext = true` 与 `fetchPublicContent = true`，暂不开启需付费第三方 Key 的 `x_search`（Twitter/X）抓取。
- **拍板理由**：官方博客、工程专栏与开发者 RSS 无需额外付费 Key 即可免鉴权直连，信息密度高于 X 碎片推文，且天然适配现有 `auto` 模型流水线自动生成中文标题（`analysis.title_zh`）与中文结构化导读。

---

## 四、全链路工作机制：拉取、解析、精选与站内展示

```text
[18 家微信公众号 (WeRead mp/cover)]     [美团技术博客 RSS]
                 │                              │
                 ▼                              ▼
        1. 采集调度层 (packages/backend/src/sources/mp.ts & rss.ts)
           - 微信读书接口拉取最新文章 URL，wr_skey 过期自动调用 /web/login/renewal 续期
                 │
                 ▼
        2. 微信正文解析层 (packages/backend/src/content/extract.ts -> extractWechatPage)
           - 模拟桌面 Chrome UA 直连拉取 mp.weixin.qq.com/s?...
           - 提取 #js_content 富文本 / 小绿书 cgiDataNew 图集
           - data-src 转 src、去 SVG 占位符、合并多行代码块、提取 var ct 发布时间
                 │
                 ▼
        3. 四阶段大模型流水线 (packages/backend/src/editorial/ + industry/prompts/)
           - 预筛 (prefilter.md) → 双盲独立打分 (selection-score.md)
           - 内容理解 (content-understanding.md)：生成中文标题、结构化导读、推荐理由、技术标签
           - 事件聚簇与成刊：归并同一事件、计算热度榜 (/hot)、生成每日 08:00 日报 (/daily)
                 │
                 ▼
        4. 站内全文渲染与配图反防盗链 (apps/web + /api/img-proxy)
           - 站内直接展示「AI 导读 + 推荐理由 + 章节目录 TOC + 完整图文正文」
           - 所有 mmbiz.qpic.cn 配图自动签名走 /api/img-proxy，注入微信 Referer 并转 WebP 缓存
```

### 1. 怎么拉取文章（Collection）

- **微信公众号采集（[`packages/backend/src/sources/mp.ts`](../packages/backend/src/sources/mp.ts)）**：
  - `techdigest-worker` 每 15 分钟运行 `cron.sources.mp-reconcile`，找出到期的 `mp` 信源并投递 `source.collect.mp` 任务。
  - **决策记录（2026-10-21 免费混合实时采集与自进化合集池）**：
    1. 采集器同时并行调用**微信原生免登录合集接口**（`https://mp.weixin.qq.com/mp/appmsgalbum`，合集文章 0 秒实时且带完整 `chksm` 链接）与**微信读书公众号接口**（`https://weread.qq.com/api/mp/cover?bookId=<mpId>`，已将 18 个公众号全部加入微信读书书架 `shelf/add` 提权），兼顾合集 0 秒实时与非合集全量兜底，免费且不触碰高封号风险的公众平台后台 `appmsgpublish` 接口。
    2. **自进化合集池（`autoDiscoverAlbums`）**：内置全库扫描出的 16 个活跃合集 ID，且每次拉取新文章正文 HTML 时自动提取页面内出现的 `album_id` 追加写入数据库 `sources.config.albums`，新开专题合集自动纳入秒级监控。
    3. **次条与多篇补抓（`fetchWereadRecentArticles`）**：当 `/api/mp/cover` 检测到 `reviewId` 变更（有新群发）时，联动请求一次 `/web/mp/articles?bookId=<mpId>&offset=0` 补抓同批次次条推文；若开启极致了（Dajiala）商业列表接口，正文抓取优先走免费直连 `extractFromUrl`，仅失败时回退付费 `article_detail`。
  - **自动续期**：当检测到 `errCode === -2012`（`wr_skey` 会话过期）时，`mp.ts` 中的 `renewWereadCookie()` 会自动请求 `POST https://weread.qq.com/web/login/renewal` 刷新 `wr_skey` 并透明重试。
- **RSS 采集（[`packages/backend/src/sources/rss.ts`](../packages/backend/src/sources/rss.ts)）**：
  - 定期拉取 `https://tech.meituan.com/rss.xml`，当条目缺少 `<pubDate>` 时自动从链接 `/YYYY/MM/DD/` 解析发布时间。

### 2. 怎么解析微信文章（Extraction）

为了避免用户点击外链跳转到微信时遭遇环境风控拦截，采集器入库前会直接拉取并解析微信原文页面：

- **请求伪装（[`packages/backend/src/lib/http-fetch.ts`](../packages/backend/src/lib/http-fetch.ts)）**：对 `mp.weixin.qq.com`、`weread.qq.com`、`qpic.cn`、`qlogo.cn` 自动使用桌面 Chrome User-Agent，并在请求微信图床 `qpic.cn` / `qlogo.cn` 时自动附带 `Referer: https://mp.weixin.qq.com/`。
- **微信专用解析器（[`packages/backend/src/content/extract.ts`](../packages/backend/src/content/extract.ts) 中的 `extractWechatPage`）**：
  1. **普通技术长文**：精准提取 `#js_content` 容器内的 HTML，将微信懒加载图片的 `data-src` 还原为标准 `src`，移除空白 SVG 占位图，将微信拆成多个 `<code>` 的代码块合并还原为标准多行代码块，并从内联脚本提取 `var ct = "..."` 真实发布时间戳。
  2. **图文/小绿书格式（`item_show_type: 8`）**：当页面无 `#js_content` 时，自动解析 `window.cgiDataNew` 中的 `content_noencode` 文本与 `picture_page_info_list` 高清图集 URL，组装为完整图文正文。
  3. **清洗与目录生成**：经 `cleanBodyHtml` 净化后生成章节锚点与左侧本文目录（TOC），存入数据库 `articles.content`（状态标记为 `body_status = 'ok'`）。

### 3. 大模型筛选、打分与导读生成（Editorial Pipeline）

正文解析完成后，Worker 自动执行四阶段处理（提示词位于 [`industry/prompts/`](../industry/prompts/)，模型配置在 `.env`）：

1. **预筛（[`industry/prompts/prefilter.md`](../industry/prompts/prefilter.md)）**：剔除纯招聘、会议营销、非技术类水文。
2. **双盲独立打分（[`industry/prompts/selection-score.md`](../industry/prompts/selection-score.md)）**：调用两次模型独立评估工程深度、架构设计和量化收益，取平均分对比门槛，决定是否进入首页「精选」。
3. **内容理解与导读写作（[`industry/prompts/content-understanding.md`](../industry/prompts/content-understanding.md)）**：生成结构化导读（核心问题、技术方案、落地效果）、推荐理由、所属分类（[`industry/taxonomy.ts`](../industry/taxonomy.ts)）与公司/方向标签（[`industry/topics.json`](../industry/topics.json)）。
   - **决策记录（2026-10-21）**：中文文章在发布层（[`packages/backend/src/publication/publish.ts`](../packages/backend/src/publication/publish.ts)）统一保留微信公众号/博客原始标题（`article.title`），不采用大模型改写标题（`analysis.title_zh`），确保读者在微信看到的文章标题与站内列表完全一致。
   - **决策记录（2026-10-22 主模型 `auto` 三次重试与豆包 `doubao-seed-2.1-lite` 自动兜底）**：
     - **配置与行为**：主模型默认走 `LLM_MODEL=auto`（`http://127.0.0.1:18081/v1`），在 [`packages/backend/src/providers/llm.ts`](../packages/backend/src/providers/llm.ts) 的 `chatJson` 中内置主模型最多 `3` 次尝试（首次调用 + 失败后间隔 `5s` 重试 `2` 次，自动释放网关超时产生的 `unknown` 占位回执）；若 `auto` 连续 3 次均失败（如网关 `504`、超时或不可用），自动无缝切换至火山方舟豆包轻量备用模型 `doubao-seed-2.1-lite`（[`site/models.ts`](../site/models.ts)，同时预置更低成本的 `doubao-seed-2.0-mini`，使用 `.env` 中的 `DOUBAO_BASE_URL` 与 `DOUBAO_API_KEY`）。
   - **决策记录（2026-10-22 三级内容分层与「全部」语义自洽方案 A）**：
     - **拍板内容**：
       1. **第一层 · `精选`（`/`）**：`T1` 入选门槛由 `45` 上调至 `65`（[`industry/selection.ts`](../industry/selection.ts)），且在评测落盘（[`packages/backend/src/editorial/analyze.ts`](../packages/backend/src/editorial/analyze.ts)）强制排除 `category = 'industry'`，确保「精选」只收录高评价硬核技术长文。
       2. **第二层 · `全部技术动态`（`/all` 默认「技术动态」主池）**：筛选栏仅展示 5 个纯技术分类（`工程实践`、`模型与算法`、`工具与平台`、`技术深度`、`架构思考`），后端 [`packages/backend/src/publication/pool.ts`](../packages/backend/src/publication/pool.ts) 默认过滤 `category <> 'industry' AND score >= 50`，使得筛选栏中的「全部」严格等于 5 个纯技术分类的并集，消除「全部却漏掉某一类」的语义矛盾。
       3. **第三层 · `周边与快讯`（`/all?category=industry` 独立副池）**：在桌面端侧边栏与 `/all` 顶部提供 `[ 技术动态 | 周边与快讯 ]` 切换器，专门承接 `category = 'industry'`（商业套餐如 Qoder 10 美元套餐、折扣促销、训练营、大会预告、投融资/基金公告）及 `20 <= score < 50` 的低分动态，同时剔除 `< 20` 分的失效/被删投诉页及微信违规占位页（[`packages/backend/src/content/extract.ts`](../packages/backend/src/content/extract.ts)）。
     - **拍板理由**：将「内容池范围（技术动态 vs 周边与快讯）」与「技术领域分类（5 个纯技术子类）」解耦为上下两层，既满足「精选只放高评价技术文章、技术动态不混入价格套餐与训练营」的阅读体验，又保证「全部」按钮在产品语义上 100% 自洽。
4. **事件归组、热点榜与日报（[`packages/backend/src/events/hot.ts`](../packages/backend/src/events/hot.ts) & [`packages/backend/src/reports/compose.ts`](../packages/backend/src/reports/compose.ts)）**：将相关文章归组为事件（`stories`），每 5 分钟重算热点榜（`/hot`），每天 `08:00` 生成技术日报（`/daily`），每周一 `10:00` 生成技术周报。

### 4. 怎么在站内展示（Rendering & Image Proxy）

- **站内全文阅读页（`/items/<id>`）**：
  - 路由实现位于 [`apps/web/app/routes/item.tsx`](../apps/web/app/routes/item.tsx)。
  - 因为信源开启了 `site_fulltext = true` 且 `body_status = 'ok'`，详情页以 `full` 模式渲染：顶部展示 **AI 导读与推荐理由**，下方展示 **完整解析后的图文正文**，左侧浮动展示 **本文目录（TOC）**，底部仅保留一个不起眼的「查看原出处」辅助链接。
- **微信配图反防盗链代理（`/api/img-proxy`）**：
  - 服务端渲染正文时，将所有外站图片 URL 重写为带 HMAC 签名的本站在地地址：`/api/img-proxy?u=<encoded_url>&mode=full&exp=<timestamp>&sig=<hmac>`。
  - 浏览器请求 `/api/img-proxy` 时，API 服务验证签名后带 `Referer: https://mp.weixin.qq.com/` 从 `mmbiz.qpic.cn` 取图，使用 `sharp` 转为 `image/webp` 并附带长效缓存头返回，彻底解决微信外链图片防盗链裂图问题。

---

## 五、常用运维与更新命令

### 1. 查看线上服务状态与日志

```bash
ssh -p 2222 -i ~/.ssh/resume_deploy root@106.53.113.137 '
  systemctl status techdigest-api techdigest-web techdigest-worker --no-pager
  journalctl -u techdigest-worker -n 50 --no-pager
'
```

### 2. 手动触发一次全量公众号与官方信源拉取及解析

```bash
ssh -p 2222 -i ~/.ssh/resume_deploy root@106.53.113.137 '
  cd /opt/tech-digest && /opt/node24/bin/node --env-file=.env -e "
    import { sql, closeDb } from \"@aihot/backend/db\";
    import { checkMpAccount } from \"@aihot/backend/sources/mp\";
    import { collectSource } from \"@aihot/backend/sources/collect\";
    import { sweepUnprocessed } from \"@aihot/backend/jobs/content\";
    const mps = await sql\`SELECT id FROM sources WHERE kind = '\''mp_account'\'' AND enabled = true\`;
    for (const s of mps) {
      console.log(s.id, await checkMpAccount(s.id, \"manual\"));
    }
    const others = await sql\`SELECT id FROM sources WHERE kind IN ('\''rss'\'', '\''web_list'\'') AND enabled = true\`;
    for (const s of others) {
      console.log(s.id, await collectSource(s.id));
    }
    await sweepUnprocessed();
    await closeDb();
  "
'
```

### 3. 本地修改代码后同步上线

**决策记录（2026-10-24 统一以 `wycocoyu/AIHOT` (`fork/main`) 为唯一代码基线并恢复 `cocoHot` 定制）**：
- **拍板内容**：
  1. 将本机 `/Users/mac/Code/AIHOT` 中此前未提交的 37 个 `cocoHot` 定制文件（公众号免费混合采集 `mp.ts`、微信正文解析 `extract.ts`、豆包兜底 `llm.ts`、三级内容分层 `pool.ts`、站点品牌 `site.ts`、分类与提示词 `industry/*`）正式提交并推送到 `wycocoyu/AIHOT` 的 `main` 分支（`fork/main`），与 `github-daily` 模块合为一处。
  2. 为 `modules/github-daily/server.ts` 增加并发请求去重（`refreshInFlight`）、拉取重试与历史最新快照兜底（`readLatestSnapshot`），消除零点跨天时并发请求直连 `github.com` 偶发超时导致的页面 503。
  3. 同步完整代码至线上 `/opt/tech-digest` 并重启三服务，执行全量公众号与 RSS 手动补抓。
- **拍板理由**：此前 37 个 `cocoHot` 定制文件未 `git commit`，导致 10-23 部署 `fork/main`（仅含 `github-daily`）时将线上代码覆盖回退为原版 `MyHOT`（`mpCollectorConfigured()` 因缺少 `DAJIALA_API_KEY` 返回 `false`，注销了公众号定时采集任务）。将 `cocoHot` 定制正式合入 `wycocoyu/AIHOT` 的 `main` 分支，确保 GitHub 远端、本机与线上三端一致，后续任何分支部署不再冲掉定制逻辑。

```bash
cd /Users/mac/Code/AIHOT
npm run typecheck && npm run build -w @aihot/web
tar --exclude='.git' --exclude='node_modules' --exclude='.env' -czf /tmp/techhot_deploy.tar.gz .
cat /tmp/techhot_deploy.tar.gz | ssh -p 2222 -i ~/.ssh/resume_deploy root@106.53.113.137 '
  tar -xzf - -C /opt/tech-digest &&
  systemctl restart techdigest-api techdigest-web techdigest-worker
'
```

### 4. 模型兜底配置与 Key 同步流程（`auto` → 豆包 `doubao-seed-2.1-lite` / `2.0-mini`）

- **凭据来源**：与本机 OpenViking 配置 [`~/.openviking/ov.conf`](file:///Users/mac/.openviking/ov.conf) 共用火山方舟 Plan 接口：
  - `DOUBAO_BASE_URL=https://ark.cn-beijing.volces.com/api/plan/v3`
  - `DOUBAO_API_KEY=<从 ~/.openviking/ov.conf 的 vlm.api_key 读取>`
- **重试与切换链路（[`packages/backend/src/providers/llm.ts`](../packages/backend/src/providers/llm.ts)）**：
  1. 每次模型调用优先走 `default`（即 `.env` 中的 `LLM_MODEL=auto`，网关 `http://127.0.0.1:18081/v1`）。
  2. 若 `auto` 返回 `504`（如 `[bridge:pending]`）、网关超时（`unknown`）或格式错误，`chatJson` 自动在主模型上最多尝试 **3 次**（每次间隔 `5s`，并自动把超时的 `unknown` 回执重置为 `failed` 以放行同请求重试）。
  3. 若连续 3 次均失败，自动切换至 [`site/models.ts`](../site/models.ts) 中配置的豆包备用模型 **`doubao-seed-2.1-lite`**（若需进一步压降兜底成本，将 `llm.ts` 中的 `doubao-seed-2.1-lite` 改为已预置的 `doubao-seed-2.0-mini` 即可）。
