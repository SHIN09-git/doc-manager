# TODO

本文件记录当前开源版本的完成状态和后续可选增强。

## 已完成

- [x] 项目品牌文案调整为“摹文拟笔工作台”。
- [x] 用户可见能力命名统一为“执笔人”。
- [x] 创建 `src/` 模块目录和 `build/` 打包入口。
- [x] 引入 esbuild，`npm run build` 从 `src/main.js` 生成 `build/bundle.js`。
- [x] 支持从文件夹直接打开 `index.html`。
- [x] 内置图标组件，不依赖外部 CDN。
- [x] 将常量、工具函数、格式化、验证、编码读取拆入 `src/config/` 和 `src/utils/`。
- [x] 将 IndexedDB、真实文件夹句柄存储、事件总线和状态基础设施拆入 `src/core/`。
- [x] 将 AI 请求、失败重试、友好错误、JSON 修复链路拆入 `src/modules/ai/`。
- [x] 将文档 CRUD、导入导出、列表渲染、编辑器保存拆入 `src/modules/documents/`。
- [x] 将标签、真实文件夹关联和同步拆入 `src/modules/folders/`。
- [x] 将执笔人 CRUD、规则归一化、`@` 调用、工作台渲染拆入 `src/modules/skills/`。
- [x] 将执笔人 AI 构建链路拆成单篇分析、多篇聚合、草案生成、反馈优化、生成测试。
- [x] 用 `eventBus` 连接文档、文件夹、执笔人等业务模块的渲染更新。
- [x] 增强搜索输入防抖。
- [x] 将主要工作台数据从 localStorage 迁移到 IndexedDB。
- [x] 增加 IndexedDB 写入失败后的 localStorage fallback，并修复 fallback 启动恢复路径。
- [x] 将启动存储摘要拆为 `storageBootstrap`，补充 fallback 恢复路径的可测试单元。
- [x] 为真实文件夹关联增加可注入 File System adapter，便于后续自动化测试。
- [x] 增加导入大文件时的大小提示、硬上限跳过、用户取消和进度提示。
- [x] 支持 `.txt` / `.md` / `.text` / `.csv` 编码识别，覆盖 UTF-8、GB18030 / GBK、UTF-16。
- [x] 支持 `.docx` 导入，段落和表格可读。
- [x] 支持 `.pptx` 导入，幻灯片文本、备注和表格可读。
- [x] 文档区、执笔人示范区和 PPT 素材区支持拖拽导入。
- [x] 支持把左侧文档卡片直接拖入右侧 AI 起草提示词窗口作为生成素材。
- [x] 当前文档默认导出为 `.docx` Word 文件。
- [x] Word 导出时自动清理正文开头与文档标题重复的 Markdown 加粗大标题。
- [x] 左侧文档列表点击当前文档后仅将当前项置顶，其余文档保持原顺序。
- [x] 中间文档编辑区两侧增加拖拽分隔条，可自定义调宽或调窄。
- [x] PPT 生成从网页 HTML 输出升级为原生 `.pptx` 输出。
- [x] PPTX 生成采用“AI 结构 JSON -> 前端打包原生 PowerPoint”的链路。
- [x] PPT 页数支持自定义数字输入，风格支持自定义描述并可保存为 PPT 执笔人。
- [x] PPT 页数支持自动模式，可按素材信息量让 AI 自行决定页数。
- [x] PPTX 增加数据页、路线图、组织图、图文页、附录页等原生布局。
- [x] PPTX 生成后增加结构自检，覆盖页数、标题、表格、备注和布局丰富度。
- [x] PPT 风格扩展为注册表，内置归藏杂志 / 瑞士变体与公文汇报、校园培训等默认风格。
- [x] PPT HTML 预览放大为独立弹层，并同步底部预览与二级预览页面。
- [x] 右上角增加“接口”入口，右侧栏保留“生成 / 执笔人 / PPT”。
- [x] 单元测试覆盖 AI、存储、格式化、验证、编码、文件读取、拖拽识别、执笔人分析和 PPTX 打包。

## 当前状态

- [x] `npm install` 可安装依赖。
- [x] `npm run build` 可生成浏览器加载的 bundle。
- [x] `npm run check` 可检查入口脚本和打包产物语法。
- [x] `npm test` 已通过 57 项单元测试。
- [x] `npm run test:e2e` 已通过 11 项 Playwright 浏览器测试。
- [x] 浏览器烟测通过：页面加载、接口入口、PPT 面板、PPT 拖入区和控制台错误检查。
- [x] 开源文档已重写：`README.md`、`GETTING_STARTED.md`、`ARCHITECTURE.md`、`REVIEW.md`、`CONTRIBUTING.md`、`SECURITY.md`、`TODO.md`。

## 后续优先级

### P0：稳定性

- [x] 为 IndexedDB -> localStorage fallback 增加 Playwright 浏览器集成测试。
- [x] 为文档拖拽导入、PPT 素材拖拽、执笔人示范拖拽补充 Playwright/E2E 测试。
- [x] 清理 PPT 旧风格实现残留，统一到 `src/modules/ppt/pptStyles.js` 风格注册表。
- [x] 增强 EventBus 订阅防御和取消订阅清理，并补充单元测试。

### P1：PPT 能力

- [x] 页数从固定下拉改为自定义数字输入。
- [x] 增加自动页数模式，避免内容较多时被固定页数截断。
- [x] 风格支持“自定义描述”，并允许保存为 PPT 执笔人。
- [x] 增加更多 PPTX 原生布局：数据页、路线图、组织图、图文页、附录页。
- [x] 增加 PPTX 生成后的结构自检，例如页数、标题缺失、表格过大、备注为空。
- [x] 增加归藏主题变体、正式公文汇报和校园培训等默认 PPT 风格。
- [x] 增加放大 HTML 预览弹层，解决底部预览区域过小的问题。

### P2：执笔人能力

- [ ] 支持执笔人导入 / 导出为独立包。
- [ ] 支持执笔人版本差异的更细粒度对比。
- [ ] 支持按文种、场景、部门或项目过滤执笔人。
- [ ] 增加示范文本隐私识别的本地预检查。

### P3：开源工程

- [ ] 增加 Issue 模板和 Pull Request 模板。
- [ ] 增加 CHANGELOG。
- [ ] 增加 GitHub Actions，自动运行 `npm run check` 和 `npm test`。
- [ ] 增加可选后端代理方案文档，避免生产使用时 API Key 放在浏览器。
