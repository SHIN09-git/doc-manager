# 快速开始

## 直接使用

双击或从文件夹打开 `index.html` 即可使用。当前版本已经改为普通浏览器脚本，并内置图标组件，不再依赖 `file://` 下容易失效的 ES Module 或外部 CDN。

建议使用最新版 Chrome 或 Edge。应用数据保存在本机浏览器的 IndexedDB 中。

## 可选：本地服务器方式

如果你的浏览器或系统策略限制了 `file://` 页面，可以改用本地服务器：

### Windows

双击 `start.bat`，然后访问：

```text
http://localhost:8000
```

### macOS / Linux

在项目目录运行：

```bash
./start.sh
```

然后访问：

```text
http://localhost:8000
```

## 开发命令

如果修改了 `src/` 里的源码，需要重新打包：

```bash
npm install
npm run build
npm run check
npm test
```

浏览器实际加载的是 `build/bundle.js`，不是直接加载 `src/`。

## 首次使用

1. 打开 `index.html`。
2. 在左侧管理标签、真实文件夹和文档。
3. 在中间编辑标题与正文。
4. 在右侧配置 AI 接口、维护执笔人，并通过 `@执笔人名称` 调用写作能力。

AI 接口配置只保存在当前浏览器本机，不会上传到服务器。
