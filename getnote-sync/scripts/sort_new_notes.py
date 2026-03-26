#!/usr/bin/env python3
"""
新文件自动分拣脚本（sort_new_notes.py）
==========================================
扫描 "未分类/" 目录中的新文件，根据关键词规则自动分类。

使用方法：
    python sort_new_notes.py --preview    # 仅预览，不移动
    python sort_new_notes.py --execute    # 执行移动
    python sort_new_notes.py              # 默认预览模式
"""

import os
import re
import sys
import shutil
import json
from datetime import datetime

BASE_DIR = r"f:\iCloudDrive\iCloud~md~obsidian\001AI\006MYMD\getnote"
INBOX_DIR = os.path.join(BASE_DIR, "未分类")

# ============================================================
# 目标目录定义
# ============================================================
TARGETS = {
    "01-周报":      os.path.join(BASE_DIR, "01-工作日志", "周报"),
    "01-月报":      os.path.join(BASE_DIR, "01-工作日志", "月度总结"),
    "01-日常":      os.path.join(BASE_DIR, "01-工作日志", "日常记录"),
    "02-会议":      os.path.join(BASE_DIR, "02-网点经营", "会议纪要"),
    "02-政策":      os.path.join(BASE_DIR, "02-网点经营", "政策制度"),
    "02-人事":      os.path.join(BASE_DIR, "02-网点经营", "人事管理"),
    "02-财务":      os.path.join(BASE_DIR, "02-网点经营", "财务数据"),
    "02-降本":      os.path.join(BASE_DIR, "02-网点经营", "降本增效"),
    "02-运营":      os.path.join(BASE_DIR, "02-网点经营", "运营资料"),
    "03-行业":      os.path.join(BASE_DIR, "03-行业研究", "行业深度"),
    "03-中通":      os.path.join(BASE_DIR, "03-行业研究", "中通专题"),
    "03-末端":      os.path.join(BASE_DIR, "03-行业研究", "末端生态"),
    "03-竞品":      os.path.join(BASE_DIR, "03-行业研究", "竞品观察"),
    "04-柜市场":    os.path.join(BASE_DIR, "04-快递柜项目", "市场分析"),
    "04-柜合作":    os.path.join(BASE_DIR, "04-快递柜项目", "合作洽谈"),
    "04-柜产品":    os.path.join(BASE_DIR, "04-快递柜项目", "产品方案"),
    "05-AI编程":    os.path.join(BASE_DIR, "05-AI与技术", "AI编程"),
    "05-自动化":    os.path.join(BASE_DIR, "05-AI与技术", "自动化"),
    "05-工具":      os.path.join(BASE_DIR, "05-AI与技术", "工具笔记"),
    "06-公众号":    os.path.join(BASE_DIR, "06-副业与IP", "公众号运营"),
    "06-小红书":    os.path.join(BASE_DIR, "06-副业与IP", "小红书"),
    "06-副业":      os.path.join(BASE_DIR, "06-副业与IP", "副业规划"),
    "07-家庭会议":  os.path.join(BASE_DIR, "07-家庭生活", "家庭会议"),
    "07-子女教育":  os.path.join(BASE_DIR, "07-家庭生活", "子女教育"),
    "07-生活":      os.path.join(BASE_DIR, "07-家庭生活", "生活记录"),
    "08-书评":      os.path.join(BASE_DIR, "08-阅读笔记", "书评读后感"),
    "08-商业":      os.path.join(BASE_DIR, "08-阅读笔记", "商业案例"),
    "09-复盘":      os.path.join(BASE_DIR, "09-个人复盘"),
    "99-历史":      os.path.join(BASE_DIR, "99-归档", "历史资料"),
    "99-客户":      os.path.join(BASE_DIR, "99-归档", "客户资料"),
    "99-杂项":      os.path.join(BASE_DIR, "99-归档", "杂项"),
}

# ============================================================
# 分类规则引擎 — 基于标题关键词，按优先级排列
# 每个规则是 (目标key, [关键词列表], [排除关键词列表])
# ============================================================
RULES = [
    # --- 01 工作日志 ---
    ("01-周报",     [r"工作周报\d"], []),
    ("01-月报",     [r"\d{4}-?\d{1,2}月工作总结", r"\d{1,2}月工作总结"], []),

    # --- 07 家庭 (优先匹配) ---
    ("07-家庭会议", ["家庭会议", "家庭讨论", "家庭健康", "家庭关于", "家庭事务"], []),
    ("07-子女教育", ["家长会", "初中", "英语学期", "语文学习", "子女教育", "亲子", "初一英语"], []),

    # --- 04 快递柜 (精确优先) ---
    ("04-柜市场",   ["快递柜市场", "快递柜行业", "柜子市场", "智能柜市场", "快递柜第三方"], []),
    ("04-柜合作",   ["快递柜合作", "快递柜业务", "柜子业务", "柜子交易", "柜子咨询"], []),
    ("04-柜产品",   ["柜子安装", "柜子定制", "快递柜安装"], []),
    ("04-柜市场",   ["快递柜", "智能柜", "丰巢", "无人驿站", "室内柜", "室外柜"], []),

    # --- 06 副业与IP ---
    ("06-小红书",   ["小红书"], []),
    ("06-公众号",   ["公众号", "快递营销内容", "快递写作素材", "快递创作", "快递公众号",
                     "wechat official", "内容工厂", "内容营销"], []),
    ("06-副业",     ["副业", "个人IP", "IP打造", "IP运营", "做IP", "航海家",
                     "B站航海", "自媒体多平台", "旧衣回收"], []),

    # --- 05 AI与技术 ---
    ("05-AI编程",   ["AI编程", "AI助力", "AI工具", "AI辅助", "Claude", "GPT",
                     "Antigravity", "OpenClaw", "OPENCLAW", "AI虚拟",
                     "chat log", "chatme", "个人数字助理", "点助手", "agent框架"], []),
    ("05-自动化",   ["N8N", "n8n", "自动化", "工作流", "RPA", "PostgreSQL",
                     "数据库", "服务器", "API服务"], []),
    ("05-工具",     ["claude code", "Mac mini", "路由器", "软路由", "iOS系统"], []),

    # --- 02 网点经营 ---
    ("02-会议",     ["月会", "月例会", "周例会", "年会", "全国网络", "片区会议",
                     "网管会议", "工作会议", "动员大会", "研讨会", "宣贯",
                     "座谈会", "保障会议"], ["家庭"]),
    ("02-政策",     ["关于", "通知", "规定", "规范", "管理办法", "考核", "KPI",
                     "罚款", "奖励方案", "政策", "保障预案", "指标"], []),
    ("02-人事",     ["招聘", "面试", "入职", "求职", "应聘", "临时工",
                     "人员管理", "补员", "快递员招聘", "快递员岗位",
                     "收派员", "派送岗位", "货车司机"], []),
    ("02-财务",     ["财务", "发票", "账户", "开票", "税务", "中转费",
                     "社保", "报价", "账单", "网银", "对公账户"], []),
    ("02-降本",     ["降本增效", "成本控制", "成本分析", "调优",
                     "直分直送", "降本", "增效"], []),
    ("02-运营",     ["网点运营", "网点经营", "网点走访", "网点业务",
                     "网点人员", "承包区", "业务员", "派件数据",
                     "建包方案", "巴枪", "操作手册", "服务质量",
                     "快递公司", "快递区域", "快递工作", "物流业务",
                     "云仓", "取件流程", "考勤系统", "安全生产",
                     "竞聘", "述职", "业务合作"], []),

    # --- 03 行业研究 ---
    ("03-竞品",     ["顺丰", "圆通", "韵达", "申通", "菜鸟", "百世", "极兔"], ["中通"]),
    ("03-中通",     ["中通凭什么", "中通人", "赖梅松", "赖建法", "金任群", "朱晶熙",
                     "中通快运", "中通科技", "中通会员", "中通商业",
                     "中通基层", "ZTO", "中通2026", "中通快递十四五",
                     "中通快递发展"], []),
    ("03-末端",     ["末端", "驿站", "最后100米", "快递进村"], []),
    ("03-行业",     ["快递行业", "快递价格", "快递企业", "快递加盟",
                     "快递江湖", "价格战", "通达系", "派费博弈",
                     "闪购业务", "逆向物流", "集中化趋势", "行业新周期",
                     "上门能力", "春节服务保证金", "科技在快递"], []),

    # --- 08 阅读笔记 ---
    ("08-书评",     ["读后感", "读书笔记", "规训与惩罚", "拉法耶特",
                     "电车难题", "非暴力沟通", "《黑莓》"], []),
    ("08-商业",     ["社区团购", "社交电商", "社群运营", "团购",
                     "烘焙店", "面包店", "叮咚买菜", "盒马", "美团优选",
                     "电商新聚变", "日本消费社会", "稻盛和夫",
                     "垂直小店", "素人自媒体"], []),

    # --- 09 个人复盘 ---
    ("09-复盘",     ["个人发展", "个人规划", "年度反思", "个人复盘",
                     "年终分享"], ["网点"]),

    # --- 01 日常 (宽泛匹配) ---
    ("01-日常",     ["日常工作", "日常事务", "今日工作", "工作日工作",
                     "工作日常", "工作日志", "周一工作", "周六工作",
                     "周日", "周末工作", "多任务处理", "个人工作",
                     "个人近期", "数据处理", "工作学习总结"], []),

    # --- 07 生活 ---
    ("07-生活",     ["徒步", "旅行", "出差", "流浪猫", "苏州灵白线",
                     "苏州虎丘湿地", "大峡谷"], []),

    # --- 99 归档 ---
    ("99-客户",     ["名片", "联系人", "身份证", "保单", "营业执照"], []),
    ("99-历史",     ["合同", "协议", "兔喜", "组织架构", "菜鸟电子面单"], []),
]


def classify_by_title(filename: str) -> str:
    """根据文件名返回分类key，返回 None 如果无法匹配"""
    for target_key, keywords, excludes in RULES:
        for kw in keywords:
            if re.search(kw, filename):
                # 检查排除词
                if any(ex in filename for ex in excludes):
                    continue
                return target_key
    return None


def classify_by_frontmatter(filepath: str) -> str:
    """尝试读取文件frontmatter中的tags来辅助分类"""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read(2000)  # 只读前2000字符

        # 提取tags
        tag_match = re.search(r"tags:\s*\n((?:\s*-\s*.+\n)*)", content)
        if not tag_match:
            return None

        tags_text = tag_match.group(1).lower()

        # 基于tag的分类
        tag_rules = [
            ("02-会议", ["会议", "月会"]),
            ("02-人事", ["招聘", "面试"]),
            ("04-柜市场", ["快递柜", "智能柜"]),
            ("05-AI编程", ["ai编程", "ai工具"]),
            ("05-自动化", ["n8n", "自动化"]),
            ("06-公众号", ["公众号"]),
            ("07-家庭会议", ["家庭会议"]),
            ("03-行业", ["快递行业"]),
            ("02-运营", ["快递网点运营", "网点运营"]),
        ]
        for key, tag_kws in tag_rules:
            for tkw in tag_kws:
                if tkw in tags_text:
                    return key
    except Exception:
        pass
    return None


def main():
    mode = "--preview"
    if len(sys.argv) > 1:
        mode = sys.argv[1]

    if mode not in ("--preview", "--execute"):
        print("用法: python sort_new_notes.py [--preview | --execute]")
        print("  --preview  仅预览分类建议（默认）")
        print("  --execute  执行文件移动")
        sys.exit(1)

    is_preview = (mode == "--preview")

    # 确保未分类目录存在
    os.makedirs(INBOX_DIR, exist_ok=True)

    files = [f for f in os.listdir(INBOX_DIR)
             if f.endswith(".md") and os.path.isfile(os.path.join(INBOX_DIR, f))]

    if not files:
        print("📭 未分类目录为空，没有需要处理的文件。")
        return

    print(f"📂 发现 {len(files)} 个待分类文件\n")

    auto_classified = []
    manual_needed = []

    for filename in sorted(files):
        filepath = os.path.join(INBOX_DIR, filename)

        # 先用标题匹配
        target = classify_by_title(filename)

        # 如果标题无法匹配，尝试用frontmatter
        if target is None:
            target = classify_by_frontmatter(filepath)

        if target:
            target_dir = TARGETS[target]
            target_rel = os.path.relpath(target_dir, BASE_DIR)
            auto_classified.append((filename, target, target_rel))
        else:
            manual_needed.append(filename)

    # 输出自动分类结果
    if auto_classified:
        print("✅ 自动分类建议：")
        print(f"{'文件名':<50} → {'目标目录'}")
        print("-" * 90)
        for fn, key, rel in auto_classified:
            display_fn = fn[:47] + "..." if len(fn) > 50 else fn
            print(f"  {display_fn:<48} → {rel}")

            if not is_preview:
                src = os.path.join(INBOX_DIR, fn)
                dst = os.path.join(TARGETS[key], fn)
                if os.path.exists(dst):
                    name, ext = os.path.splitext(fn)
                    dst = os.path.join(TARGETS[key], f"{name}_新增{ext}")
                shutil.move(src, dst)

    # 输出需要手动分类的文件
    if manual_needed:
        print(f"\n⚠️  以下 {len(manual_needed)} 个文件无法自动分类，需要手动处理：")
        for fn in manual_needed:
            print(f"  • {fn}")

    # 总结
    print(f"\n📊 统计：自动分类 {len(auto_classified)} 个，需手动 {len(manual_needed)} 个")

    if is_preview and auto_classified:
        print("\n💡 提示：使用 --execute 参数执行实际移动")
    elif not is_preview:
        print(f"\n✅ 已移动 {len(auto_classified)} 个文件")

        # 保存日志
        log_path = os.path.join(BASE_DIR, "_sort_log.json")
        log_data = {
            "timestamp": datetime.now().isoformat(),
            "auto_classified": [(fn, key) for fn, key, _ in auto_classified],
            "manual_needed": manual_needed
        }
        with open(log_path, "w", encoding="utf-8") as f:
            json.dump(log_data, f, ensure_ascii=False, indent=2)
        print(f"  日志已保存到: {log_path}")


if __name__ == "__main__":
    main()
