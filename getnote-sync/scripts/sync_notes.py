"""Sync Get笔记 notes to local Obsidian-compatible Markdown files.

Supports full sync and incremental sync (only new notes since last sync).
Tracks sync state in .sync_state.json.

Usage:
  python sync_notes.py          # Incremental sync (or full if first run)
  python sync_notes.py --full   # Force full sync
"""
import urllib.request, json, ssl, sys, os, re, time
from datetime import datetime

sys.stdout.reconfigure(encoding="utf-8")

API_KEY = os.environ.get("GETNOTE_API_KEY", "")
CLIENT_ID = os.environ.get("GETNOTE_CLIENT_ID", "")
BASE = "https://openapi.biji.com"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(BASE_DIR, ".sync_state.json")
CTX = ssl.create_default_context()

TYPE_MAP = {
    "plain_text": "纯文本",
    "audio": "即时录音",
    "meeting": "会议录音",
    "local_audio": "本地音频",
    "internal_record": "内录音频",
    "link": "链接",
    "book": "书籍",
    "img_text": "图片笔记",
}

AUDIO_TYPES = {
    "audio", "meeting", "local_audio", "internal_record",
    "recorder_audio", "recorder_flash_audio", "class_audio",
}


# ── State ────────────────────────────────────────────────────────────────────

def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_state(state):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


# ── API ──────────────────────────────────────────────────────────────────────

def api_get(path, params=None):
    url = f"{BASE}{path}"
    if params:
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        url += f"?{qs}"
    req = urllib.request.Request(url)
    req.add_header("Authorization", API_KEY)
    req.add_header("X-Client-ID", CLIENT_ID)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, context=CTX, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            if attempt < 2:
                time.sleep(2)
            else:
                print(f"  FAIL {url}: {e}", flush=True)
                return None


# ── Helpers ──────────────────────────────────────────────────────────────────

def safe_filename(name):
    name = re.sub(r'[<>:"/\\|?*]', "_", name)
    name = name.strip(". ")
    if len(name) > 120:
        name = name[:120]
    return name or "无标题"


def build_md(note, audio_original=""):
    title = note.get("title", "无标题") or "无标题"
    note_type = note.get("note_type", "unknown")
    type_cn = TYPE_MAP.get(note_type, note_type)
    created_at = note.get("created_at", "")
    updated_at = note.get("updated_at", "")
    source = note.get("source", "")
    entry_type = note.get("entry_type", "")
    nid = note.get("id", "")
    tags = [t["name"] for t in note.get("tags", [])]
    content = note.get("content", "") or ""

    tags_yaml = "\n".join([f"  - {t}" for t in tags]) if tags else "  - 未分类"

    lines = [
        "---",
        f'title: "{title}"',
        f"date: {created_at}",
        f"updated: {updated_at}",
        f"type: {type_cn}",
        f"note_type: {note_type}",
        f"source: {source}",
        f"entry_type: {entry_type}",
        f"note_id: {nid}",
        "tags:",
        tags_yaml,
        "aliases:",
        f'  - "{title}"',
        "---",
        "",
        f"# {title}",
        "",
    ]

    if content:
        lines.append(content)
        lines.append("")

    if audio_original:
        lines.append("---")
        lines.append("")
        lines.append("## 录音原文")
        lines.append("")
        lines.append(audio_original)
        lines.append("")

    return "\n".join(lines)


# ── Sync ─────────────────────────────────────────────────────────────────────

def fetch_notes_since(last_synced_id=None):
    """Fetch notes from API. If last_synced_id is set, stop when we reach it."""
    all_notes = []
    since_id = 0
    while True:
        data = api_get("/open/api/v1/resource/note/list", {"since_id": since_id})
        if not data or not data.get("success"):
            print(f"  List API error at since_id={since_id}", flush=True)
            break
        notes = data["data"]["notes"]

        if last_synced_id:
            # Stop when we encounter a note we've already synced
            new_notes = []
            hit_boundary = False
            for n in notes:
                if n["id"] == last_synced_id or n["id"] < last_synced_id:
                    hit_boundary = True
                    break
                new_notes.append(n)
            all_notes.extend(new_notes)
            if hit_boundary:
                break
        else:
            all_notes.extend(notes)

        has_more = data["data"]["has_more"]
        if len(all_notes) % 200 == 0 and all_notes:
            print(f"  Listed {len(all_notes)} notes...", flush=True)
        if not has_more or not notes:
            break
        since_id = data["data"]["next_cursor"]
        time.sleep(0.2)

    return all_notes


def save_note_to_md(note):
    """Fetch detail if needed and save note as MD. Returns (filepath, status)."""
    nid = note["id"]
    title = note.get("title", "无标题") or "无标题"
    note_type = note.get("note_type", "unknown")

    # 所有新笔记统一保存到「未分类」目录，后续由 sort_new_notes.py 分拣
    folder = os.path.join(BASE_DIR, "未分类")
    fname = safe_filename(title) + ".md"
    filepath = os.path.join(folder, fname)

    if os.path.exists(filepath):
        return filepath, "skipped"

    # Fetch detail for audio/link types
    audio_original = ""
    if note_type in AUDIO_TYPES:
        detail = api_get("/open/api/v1/resource/note/detail", {"id": nid})
        if detail and detail.get("success"):
            dn = detail["data"]["note"]
            audio_info = dn.get("audio", {})
            if audio_info:
                audio_original = audio_info.get("original", "")
            if dn.get("content"):
                note["content"] = dn["content"]
        time.sleep(0.2)
    elif note_type == "link":
        detail = api_get("/open/api/v1/resource/note/detail", {"id": nid})
        if detail and detail.get("success"):
            dn = detail["data"]["note"]
            if dn.get("content"):
                note["content"] = dn["content"]
            wp = dn.get("web_page", {})
            if wp and wp.get("content"):
                note["content"] = note.get("content", "") + "\n\n---\n\n## 原文内容\n\n" + wp["content"]
        time.sleep(0.2)

    md = build_md(note, audio_original)
    os.makedirs(folder, exist_ok=True)
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(md)
        return filepath, "saved"
    except Exception as e:
        print(f"  ERROR saving {filepath}: {e}", flush=True)
        return filepath, "error"


def generate_report(mode, notes, saved, skipped, errors, duration, new_folders):
    """Generate sync report as JSON string."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Count by type
    type_stats = {}
    for n in notes:
        t = TYPE_MAP.get(n.get("note_type", ""), n.get("note_type", "unknown"))
        type_stats[t] = type_stats.get(t, 0) + 1

    # Count by folder
    tag_stats = {}
    for n in notes:
        tags = [t["name"] for t in n.get("tags", [])]
        primary = tags[0] if tags else "未分类"
        tag_stats[primary] = tag_stats.get(primary, 0) + 1

    # Current folder totals
    folder_totals = {}
    for d in sorted(os.listdir(BASE_DIR)):
        dp = os.path.join(BASE_DIR, d)
        if os.path.isdir(dp):
            count = len([f for f in os.listdir(dp) if f.endswith(".md")])
            if count > 0:
                folder_totals[d] = count

    report = {
        "sync_time": now,
        "mode": mode,
        "duration_seconds": round(duration, 1),
        "notes_found": len(notes),
        "saved": saved,
        "skipped_duplicate": skipped,
        "errors": errors,
        "new_by_type": type_stats,
        "new_by_tag": tag_stats,
        "new_folders_created": new_folders,
        "local_folder_totals": folder_totals,
        "total_local_notes": sum(folder_totals.values()),
    }
    return report


def main():
    if not API_KEY or not CLIENT_ID:
        print("ERROR: GETNOTE_API_KEY and GETNOTE_CLIENT_ID env vars required")
        sys.exit(1)

    force_full = "--full" in sys.argv
    state = load_state()
    last_synced_id = None if force_full else state.get("last_synced_note_id")
    mode = "full" if not last_synced_id else "incremental"

    # Track existing folders
    existing_folders = set(
        d for d in os.listdir(BASE_DIR)
        if os.path.isdir(os.path.join(BASE_DIR, d))
    )

    start_time = time.time()

    # Phase 1: Fetch notes
    if mode == "incremental":
        print(f"=== 增量同步 (上次同步: {state.get('last_sync_time', 'N/A')}) ===", flush=True)
    else:
        print("=== 全量同步 ===", flush=True)

    print("Fetching note list...", flush=True)
    notes = fetch_notes_since(last_synced_id)
    print(f"  Found {len(notes)} {'new ' if mode == 'incremental' else ''}notes", flush=True)

    if not notes:
        duration = time.time() - start_time
        report = generate_report(mode, [], 0, 0, 0, duration, [])
        print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
        # Update sync time even if no new notes
        state["last_sync_time"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        save_state(state)
        return

    # Phase 2: Save notes
    print("Saving notes...", flush=True)
    saved = 0
    skipped = 0
    errors = 0

    for i, note in enumerate(notes):
        _, status = save_note_to_md(note)
        if status == "saved":
            saved += 1
        elif status == "skipped":
            skipped += 1
        else:
            errors += 1

        total_done = saved + skipped + errors
        if total_done % 100 == 0 and total_done > 0:
            print(f"  Progress: {saved} saved, {skipped} skipped ({total_done}/{len(notes)})", flush=True)

    duration = time.time() - start_time

    # Track new folders
    current_folders = set(
        d for d in os.listdir(BASE_DIR)
        if os.path.isdir(os.path.join(BASE_DIR, d))
    )
    new_folders = sorted(current_folders - existing_folders)

    # Update state
    state["last_synced_note_id"] = notes[0]["id"]  # notes[0] is the most recent
    state["last_sync_time"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    state["total_syncs"] = state.get("total_syncs", 0) + 1
    save_state(state)

    # Generate and print report
    report = generate_report(mode, notes, saved, skipped, errors, duration, new_folders)
    print("\n" + json.dumps(report, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
