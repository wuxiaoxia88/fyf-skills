---
name: getnote-sync
description: |
  同步 Get笔记 到本地 Obsidian。
  当用户提到以下意图时触发：
  - 「同步笔记」「sync notes」「同步 getnote」「拉取笔记」「更新笔记」
  - 「全量同步」「增量同步」「同步最新笔记」
  关键词：同步、sync、getnote、拉取笔记
---

# Get笔记同步 Skill

将 Get笔记 云端笔记增量同步到本地 Obsidian vault，采用「先收集、再分拣」两步工作流。

## 工作流程

### 第一步：同步笔记（拉取到未分类目录）

运行同步脚本（需要 `GETNOTE_API_KEY` 和 `GETNOTE_CLIENT_ID` 环境变量）：

```bash
# 增量同步（默认，只同步上次之后的新笔记）
python3 "F:/iCloudDrive/iCloud~md~obsidian/001ai/006mymd/getnote/sync_notes.py"

# 全量同步（重新同步所有笔记）
python3 "F:/iCloudDrive/iCloud~md~obsidian/001ai/006mymd/getnote/sync_notes.py" --full
```

所有新笔记统一保存到 `F:/iCloudDrive/iCloud~md~obsidian/001ai/006mymd/getnote/未分类/` 目录。

### 第二步：自动分类（从未分类目录分拣到各子目录）

同步完成后，运行分类脚本：

```bash
# 预览分类建议（不移动文件）
python3 "F:/iCloudDrive/iCloud~md~obsidian/001ai/006mymd/getnote/sort_new_notes.py" --preview

# 确认无误后执行移动
python3 "F:/iCloudDrive/iCloud~md~obsidian/001ai/006mymd/getnote/sort_new_notes.py" --execute
```

- 先运行 `--preview` 让用户确认分类建议
- 用户确认后再运行 `--execute` 执行移动
- 无法自动分类的文件会单独列出，留在「未分类」中供手动处理
- 分类规则可在 `sort_new_notes.py` 的 RULES 列表中添加新关键词优化

## 同步逻辑

- **增量同步**：记录上次最新 note_id，下次只拉取比它更新的笔记
- **全量同步**：忽略上次状态，遍历所有笔记（已存在的文件不会覆盖）
- **状态文件**：`F:/iCloudDrive/iCloud~md~obsidian/001ai/006mymd/getnote/.sync_state.json`

## 文件规则

- 所有新笔记先统一进入「未分类」目录
- 文件名：`{标题}.md`（特殊字符替换为下划线）
- 同名文件自动跳过，不覆盖
- 录音类笔记自动获取完整转写原文
- 链接类笔记自动获取网页原文

## 同步报告

脚本运行结束后输出 JSON 格式报告，包含：
- sync_time: 同步时间
- mode: full / incremental
- duration_seconds: 耗时
- notes_found: 发现的新笔记数
- saved: 成功保存数
- skipped_duplicate: 跳过的重复数
- errors: 错误数
- new_by_type: 按类型统计
- new_by_tag: 按标签统计
- new_folders_created: 新创建的文件夹
- local_folder_totals: 各文件夹当前笔记数
- total_local_notes: 本地总笔记数

**收到同步报告后，请用中文向用户展示格式化的同步报告表格，然后提示用户是否要运行分类脚本。**
