from pathlib import Path
import re

from app.db.models import MemoryEntry


def safe_markdown_filename(title: str, memory_id: int) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:60] or "memory"
    return f"{memory_id}-{slug}.md"


def render_memory_markdown(entry: MemoryEntry) -> str:
    return (
        "---\n"
        f"id: {entry.id}\n"
        f"scope: {entry.scope}\n"
        f"space_id: {entry.space_id if entry.space_id is not None else 'null'}\n"
        f"category: {entry.category}\n"
        f"status: {entry.status}\n"
        "---\n\n"
        f"# {entry.title}\n\n"
        f"{entry.content}\n"
    )


def write_markdown_export(entry: MemoryEntry, directory: Path) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / safe_markdown_filename(entry.title, entry.id)
    target.write_text(render_memory_markdown(entry), encoding="utf-8")
    return target
