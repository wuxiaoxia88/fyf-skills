# chatgpt-web-image

通过 ChatGPT 网页版进行图片生成、下载到本地，并返回本地文件路径的 skill。

当前版本已经在 macOS + 本地 Chrome + ChatGPT 中文界面上完成实测。

功能包括：
- 连接本机已登录的 ChatGPT 网页标签页
- 进入“生成图片”模式
- 提交 prompt 进行生图
- 等待图片生成完成
- 先记录发送前页面里已有的生成图，避免误抓历史旧图
- 只对“本次新生成”的图片执行保存
- 读取新图的真实图片地址
- 在 Node 侧带着当前浏览器会话 cookie 请求图片数据（等价于“图片存储为”）
- 将图片直接保存到默认下载文件夹，并返回真实本地文件路径
- 输出文件名自动使用日期+时间格式，避免文件名过长或包含 prompt 文本

## 目录结构

```text
chatgpt-web-image/
├── README.md
├── SKILL.md
├── env.example
├── references/
│   ├── chatgpt-web-flow.md
│   ├── selectors-notes.md
│   └── troubleshooting.md
└── scripts/
    ├── config.js
    ├── cdp_helpers.js
    ├── probe_chatgpt.js
    └── run_generate_image.js
```

## 适用场景

当你希望让 AI 通过 ChatGPT 网站而不是 API 来生图时，可以使用这个 skill。

比如：
- 用 ChatGPT 网页版生成图片
- 让 AI 自动下载 ChatGPT 生成的图片
- 复用你自己已经登录的 ChatGPT 浏览器会话

## 环境要求

- macOS（当前已验证）
- Google Chrome 已安装
- ChatGPT 账号可正常登录网页端
- Chrome 允许通过 remote debugging 被连接
- Node.js 可用

## 首次使用步骤

### 1. 启动专用 Chrome

建议使用独立 profile，避免污染你平时的浏览器配置。

macOS 启动命令：

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.chatgpt-image-skill-chrome" \
  --no-first-run \
  --no-default-browser-check \
  https://chatgpt.com/
```

### 2. 登录 ChatGPT

在这个专用 Chrome 里手动登录 ChatGPT。

建议：
- 登录后保持这个窗口不要关闭
- 后续脚本会直接复用这个已登录标签页

### 3. 先跑探测脚本

```bash
node ./chatgpt-web-image/scripts/probe_chatgpt.js
```

成功时会输出：
- 浏览器版本
- ChatGPT 页签 wsUrl
- 是否已登录
- 输入框是否存在
- 当前页面是否还能看到“生成图片”入口

### 4. 运行生图脚本

例如：

```bash
node ./chatgpt-web-image/scripts/run_generate_image.js "Generate a simple red apple icon on white background"
```

脚本会：
1. 连接当前 ChatGPT 标签页
2. 检查输入框与登录状态
3. 必要时点击“生成图片”入口
4. 填入 prompt 并发送
5. 轮询等待图片生成
6. 点击“分享此图片”
7. 在弹层中点击“下载”
8. 用 CDP 事件捕获真实下载文件路径

## 输出目录

默认输出目录：

```text
~/Downloads
```

默认文件名格式：

```text
chatgpt_image_YYYYMMDD_HHMMSS.png
```

例如：

```text
chatgpt_image_20260423_181529.png
```

生成成功后，脚本会返回类似结果：

```json
{
  "ok": true,
  "browser": "Chrome/147.0.7727.102",
  "prompt": "Generate a simple purple moon icon on white background",
  "generatedImage": {
    "alt": "Purple crescent on white background",
    "src": "https://chatgpt.com/backend-api/estuary/content?id=file_...",
    "w": 1254,
    "h": 1254
  },
  "downloadedFilePath": "/Users/you/.chatgpt-image-skill-output/ChatGPT Image 2026年4月23日 06_06_14.png"
}
```

## 已验证的关键选择器

### 输入框
- `#prompt-textarea`
- fallback: `div[contenteditable="true"][role="textbox"]`

### 发送按钮
- `#composer-submit-button`
- `[data-testid="send-button"]`
- 已观察到 aria-label：`发送提示`

### 图片生成状态
- 生成中：可能出现 `停止流式传输`
- 生成后：可能出现 `已停止思考`

### 生成图片定位
v1 最稳定规则：
- 取最新可见图片
- 且宽高 >= 512
- 且 `src` 包含 `/backend-api/estuary/content?id=file_`

### 下载路径
当前最稳定路径：
1. 点击 `分享此图片`
2. 在分享弹层中点击 `下载`
3. 通过 `Browser.downloadWillBegin` / `Browser.downloadProgress` 捕获下载完成

## 为什么不走截图

这个 skill 的目标是拿到原始图片文件，而不是截图。

相比 screenshot：
- 原图更清晰
- 文件更真实
- 不会截到 UI 边框和遮罩
- 更适合复用、归档和后续处理

## 已知限制

- 当前主要验证的是 ChatGPT 中文界面
- UI 改版后，按钮和结构可能变化
- 如果一个会话里有很多历史图片，选择“最新一张”的逻辑可能需要继续增强
- 某些账号/地区/套餐下，图片入口可能不同
- 当前 v1 更适合单图生成，不是批量图像工作流

## 常见问题

### 1. probe 提示没登录
说明专用 Chrome 里没有登录 ChatGPT。
重新打开专用 profile 并手动登录即可。

### 2. 输入框有，但发不出去
说明发送按钮没有正确出现，通常是：
- 不是当前真正的输入框
- 页面状态异常
- ChatGPT 还没准备好

建议：
- 刷新当前页
- 重新运行 probe
- 再执行 generate

### 3. 生成成功但下载失败
通常是：
- 分享弹层没打开成功
- 下载按钮文本变了
- 页面结构发生变化

建议：
- 先手动确认分享弹层里仍然有“下载”
- 再根据 `references/selectors-notes.md` 调整规则

### 4. 生成很慢
图片生成本身可能较慢。
可以通过环境变量调整超时，见 `env.example`。

## 推荐分享方式

如果你要把这个 skill 分享给其他 AI / Agent 使用，建议对外说明：
- 这是“网页自动化 skill”，不是 API SDK
- 依赖本机已登录 ChatGPT 浏览器会话
- 依赖 CDP remote debugging
- 最适合个人工作流和桌面自动化

## 参考文档

- `SKILL.md`：Skill 主说明
- `references/selectors-notes.md`：已验证的选择器
- `references/chatgpt-web-flow.md`：工作流概览
- `references/troubleshooting.md`：问题排查
