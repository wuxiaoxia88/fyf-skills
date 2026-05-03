---
name: gemini-picture
description: 使用 Gemini 生成多张图片并下载到本地。用户提供一组提示词，Skill 按顺序生成图片，完成后返回文件路径列表，供 AI 通过 message 工具发送给用户。关键词：生图、画图、绘图、生成图片。
---

# Gemini Picture Skill

## 功能

使用 Gemini 浏览器界面，按顺序生成多张图片，稳定可靠地下载到本地目录。

## 工作流程

1. 读取 `prompts.json` 获取提示词列表
2. 连接 Gemini 浏览器（自动拉起 Daemon）
3. 新建一次会话（不每张图都重开页面，节省时间）
4. 逐张生成图片（预览图模式，Canvas 提取，约 25-35 秒/张）
5. 每张图生成后立即保存，不等全部完成
6. 完成后主动关闭本次 Gemini 生图标签页（只关页面，不关闭 Daemon/浏览器进程）
7. 输出 JSON 结果（含所有图片路径）

## 使用方式

### 第一步：准备提示词文件

创建 `prompts.json`，格式如下：

```json
[
  "请生成一张赛博朋克风格的城市夜景海报，宽高比16:9，画面中央有一轮巨大的红月亮",
  "请生成一张水墨画风格的黄山云海，山峰层叠，云雾缭绕",
  "请生成一张未来城市风格的建筑效果图，高耸入云的玻璃幕墙"
]
```

### 第二步：运行脚本

```bash
node ~/.openclaw/skills/gemini-picture/generate.mjs <prompts.json> [输出目录]
```

示例：
```bash
node ~/.openclaw/skills/gemini-picture/generate.mjs /tmp/my-prompts.json /tmp/output
```

### 第三步：发送图片

脚本完成后会输出 JSON，结果示例：
```json
{
  "ok": true,
  "total": 3,
  "success": 3,
  "outputDir": "/tmp/output",
  "images": [
    { "seq": "001", "path": "/tmp/output/gemini_001_1234567890.png", "filename": "gemini_001_1234567890.png", "size": 1599600, "elapsed": 26891, "prompt": "..." },
    { "seq": "002", "path": "/tmp/output/gemini_002_1234567920.png", "filename": "gemini_002_1234567920.png", "size": 1144400, "elapsed": 25803, "prompt": "..." },
    { "seq": "003", "path": "/tmp/output/gemini_003_1234567950.png", "filename": "gemini_003_1234567950.png", "size": 1423660, "elapsed": 26897, "prompt": "..." }
  ]
}
```

AI 读取 `images[].path`，按顺序用 `message` 工具发送图片给用户。

## 配置说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| FULL_SIZE | false | 预览图模式（稳定） |
| GEN_TIMEOUT | 300000ms | 单张生成超时（5分钟） |
| DL_TIMEOUT | 60000ms | 提取超时（1分钟） |

如需更高质量（fullSize=true），需解决 CDP 下载在当前网络环境下不稳定的问题。当前预览模式已足够日常使用。

## 技术细节

- **生成模式**：预览图（Canvas 提取 + 去水印），约 1024px 宽度
- **去水印**：自动移除 Gemini 水印
- **去重**：每张图使用独立 blob URL，不会重复
- **稳定性**：无重试、无轮询、无等待，纯流水式生成
