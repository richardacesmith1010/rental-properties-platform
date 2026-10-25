#!/usr/bin/env python3
"""Stop hook (CLAUDE.md §3a): every reply to the owner ends with the model/effort line.

Blocks a stop once when the line is missing (stop_hook_active prevents a loop) and fails open
on anything unexpected, so it can never trap a session.
"""
import json
import sys
from datetime import datetime

LOG = "/tmp/domus-model-line-hook.log"  # one line per stop: time, where the reply came from, decision
MARK = "set before your next message:"
REASON = (
    "Standing rule (CLAUDE.md §3a): end every reply with one line: "
    "'**Set before your next message:** <Claude model> · <effort> — <the next work>.' "
    "Add the Codex and ChatGPT settings when the next run uses them. Send only that line now."
)


def reply_from_transcript(path):
    """Assistant text after the owner's last prompt, for versions without last_assistant_message."""
    parts = []
    with open(path) as f:
        for line in f:
            try:
                entry = json.loads(line)
            except ValueError:
                continue
            if entry.get("isSidechain"):
                continue
            content = (entry.get("message") or {}).get("content")
            if entry.get("type") == "user" and not entry.get("isMeta"):
                blocks = content if isinstance(content, list) else []
                if isinstance(content, str) or not any(
                    isinstance(b, dict) and b.get("type") == "tool_result" for b in blocks
                ):
                    parts = []
            elif entry.get("type") == "assistant" and isinstance(content, list):
                parts += [b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"]
    return "\n".join(parts)


def log(source, decision):
    try:
        with open(LOG, "a") as f:
            f.write(f"{datetime.now().isoformat(timespec='seconds')} {source} {decision}\n")
    except OSError:
        pass


def main():
    try:
        data = json.load(sys.stdin)
    except ValueError:
        return
    if not isinstance(data, dict) or data.get("stop_hook_active"):
        return
    source = "field"
    reply = data.get("last_assistant_message")
    if not isinstance(reply, str):
        source = "transcript"
        try:
            reply = reply_from_transcript(data["transcript_path"])
        except (KeyError, OSError, TypeError):
            return log(source, "skip")
        if not reply.strip():
            return log(source, "skip")
    if MARK in reply.lower():
        return log(source, "pass")
    log(source, "block")
    print(json.dumps({"decision": "block", "reason": REASON}))


if __name__ == "__main__":
    main()
