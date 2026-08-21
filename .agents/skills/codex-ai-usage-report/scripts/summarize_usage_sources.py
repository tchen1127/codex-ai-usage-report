import argparse
import json
import pathlib
from datetime import date, datetime, timedelta, timezone


def load_json(path):
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))


def selected_items(path):
    raw = load_json(path)
    values = raw.get("includedSessionIds", raw) if isinstance(raw, dict) else raw
    if not isinstance(values, list):
        raise ValueError(f"Selection must be an array or includedSessionIds object: {path}")
    result = []
    for item in values:
        if isinstance(item, str):
            value = {"id": item}
        elif isinstance(item, dict):
            identifier = item.get("id") or item.get("sessionId")
            value = {"id": str(identifier), "file": item.get("file")} if identifier else None
        else:
            value = None
        if not value:
            raise ValueError(f"Selection contains an item without id/sessionId: {path}")
        result.append(value)
    keys = [(item["id"], str(item.get("file") or "").lower()) for item in result]
    if len(keys) != len(set(keys)):
        raise ValueError(f"Selection contains duplicate session IDs: {path}")
    return result


def parse_datetime(value):
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def normalize_segments(session):
    segments = []
    for item in session.get("activeSegments") or []:
        try:
            start = parse_datetime(item["start"])
            end = parse_datetime(item["end"])
        except (KeyError, TypeError, ValueError):
            continue
        if end < start:
            continue
        minimum_end = start + timedelta(minutes=2)
        segments.append((start, max(end, minimum_end)))
    return segments


def union_minutes(segments):
    if not segments:
        return 0
    ordered = sorted(segments, key=lambda item: item[0])
    merged = []
    start, end = ordered[0]
    for next_start, next_end in ordered[1:]:
        if next_start <= end:
            end = max(end, next_end)
        else:
            merged.append((start, end))
            start, end = next_start, next_end
    merged.append((start, end))
    return round(sum((end - start).total_seconds() for start, end in merged) / 60, 1)


def resolve_sessions(evidence, selection, source_id):
    sessions = evidence.get("sessions")
    if not isinstance(sessions, list):
        raise ValueError(f"{source_id} evidence.sessions must be an array")
    key = "sessionId" if source_id == "antigravity" else "id"
    by_id = {}
    by_file = {}
    for item in sessions:
        identifier = str(item.get(key) or item.get("sessionId") or item.get("id"))
        by_id.setdefault(identifier, []).append(item)
        if item.get("file"):
            by_file[str(pathlib.Path(item["file"]).resolve()).lower()] = item
    resolved = []
    missing = []
    ambiguous = []
    for selected in selection:
        match = None
        if selected.get("file"):
            match = by_file.get(str(pathlib.Path(selected["file"]).resolve()).lower())
        if match is None:
            candidates = by_id.get(selected["id"], [])
            if len(candidates) == 1:
                match = candidates[0]
            elif len(candidates) > 1:
                ambiguous.append(selected["id"])
        if match is None and selected["id"] not in ambiguous:
            missing.append(selected["id"])
        elif match is not None:
            resolved.append(match)
    if ambiguous:
        raise ValueError(f"{source_id} selection IDs are ambiguous; include the evidence file path: {', '.join(ambiguous)}")
    if missing:
        raise ValueError(f"{source_id} selection IDs not found in evidence: {', '.join(missing)}")
    return resolved


def summarize_codex(sessions):
    tokens = {
        "inputTokens": sum(int(item.get("tokens", {}).get("input", 0)) for item in sessions),
        "outputTokens": sum(int(item.get("tokens", {}).get("output", 0)) for item in sessions),
        "reasoningTokens": sum(int(item.get("tokens", {}).get("reasoning", 0)) for item in sessions),
        "totalTokens": sum(int(item.get("tokens", {}).get("total", 0)) for item in sessions),
    }
    return {
        "id": "codex",
        "label": "Codex",
        "role": "primary",
        "workRecordCount": len(sessions),
        "activeDates": sorted({day for item in sessions for day in item.get("activeDates", [])}),
        "activeMinutes": round(sum(float(item.get("activeMinutes", 0)) for item in sessions), 1),
        "tokens": tokens,
        "tokenDefinition": "Codex token_count last_token_usage; input may include Cached Input.",
    }


def summarize_antigravity(sessions):
    unreliable = []
    for item in sessions:
        usage = item.get("modelUsage", {})
        if usage.get("readError") or int(usage.get("decodedCount", 0)) < int(usage.get("rowCount", 0)):
            unreliable.append(str(item.get("sessionId", "unknown")))
    if unreliable:
        raise ValueError(
            "Selected Antigravity sessions contain incomplete token evidence: " + ", ".join(unreliable)
        )

    token_keys = (
        "inputTokens", "outputTokens", "cacheWriteTokens", "cacheReadTokens",
        "thinkingOutputTokens", "responseOutputTokens", "totalTokens",
    )
    tokens = {
        key: sum(int(item.get("modelUsage", {}).get("tokens", {}).get(key, 0)) for item in sessions)
        for key in token_keys
    }
    if tokens["totalTokens"] != (
        tokens["inputTokens"] + tokens["outputTokens"] + tokens["cacheWriteTokens"] + tokens["cacheReadTokens"]
    ):
        raise ValueError("Antigravity totalTokens do not reconcile with input/output/cache fields")
    if tokens["outputTokens"] != tokens["thinkingOutputTokens"] + tokens["responseOutputTokens"]:
        raise ValueError("Antigravity outputTokens do not reconcile with thinking/response subsets")
    return {
        "id": "antigravity",
        "label": "Antigravity",
        "role": "backup",
        "workRecordCount": len(sessions),
        "activeDates": sorted({day for item in sessions for day in item.get("activeDates", [])}),
        "activeMinutes": round(sum(float(item.get("activeMinutes", 0)) for item in sessions), 1),
        "boundarySessionIds": sorted(
            str(item.get("sessionId")) for item in sessions if item.get("boundarySpanning")
        ),
        "tokens": tokens,
        "tokenDefinition": "ModelUsageStats; total=input+output+cache write+cache read; thinking/response are output subsets.",
    }


def main():
    parser = argparse.ArgumentParser(description="Summarize curated Codex and Antigravity evidence without classifying work.")
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True)
    parser.add_argument("--codex-evidence")
    parser.add_argument("--codex-included")
    parser.add_argument("--antigravity-evidence")
    parser.add_argument("--antigravity-included")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    start = date.fromisoformat(args.start.replace("/", "-"))
    end = date.fromisoformat(args.end.replace("/", "-"))
    if start > end:
        raise ValueError("--start must not be after --end")
    pairs = (
        ("codex", args.codex_evidence, args.codex_included),
        ("antigravity", args.antigravity_evidence, args.antigravity_included),
    )
    sources = []
    all_sessions = []
    selected_counts = {"codex": 0, "antigravity": 0}
    for source_id, evidence_path, selection_path in pairs:
        if bool(evidence_path) != bool(selection_path):
            raise ValueError(f"--{source_id}-evidence and --{source_id}-included must be supplied together")
        if not evidence_path:
            continue
        evidence = load_json(evidence_path)
        sessions = resolve_sessions(evidence, selected_items(selection_path), source_id)
        selected_counts[source_id] = len(sessions)
        if source_id == "antigravity" and not sessions:
            continue
        sources.append(summarize_codex(sessions) if source_id == "codex" else summarize_antigravity(sessions))
        all_sessions.extend(sessions)
    if not sources:
        raise ValueError("At least one evidence/selection pair is required")

    active_dates = sorted({day for source in sources for day in source["activeDates"]})
    all_have_segments = all(bool(item.get("activeSegments")) for item in all_sessions) if all_sessions else True
    if all_have_segments:
        active_minutes = union_minutes([segment for item in all_sessions for segment in normalize_segments(item)])
        active_time_method = "Union of Codex and Antigravity activity segments; overlapping cross-platform time is counted once."
    else:
        active_minutes = round(sum(source["activeMinutes"] for source in sources), 1)
        active_time_method = "Fallback sum of per-platform activity estimates; cross-platform overlap may remain."

    codex = next((item for item in sources if item["id"] == "codex"), None)
    antigravity = next((item for item in sources if item["id"] == "antigravity"), None)
    codex_tokens = codex["tokens"] if codex else {}
    ag_tokens = antigravity["tokens"] if antigravity else {}
    total_tokens = int(codex_tokens.get("totalTokens", 0)) + int(ag_tokens.get("totalTokens", 0))
    input_tokens = int(codex_tokens.get("inputTokens", 0)) + int(ag_tokens.get("inputTokens", 0)) + int(ag_tokens.get("cacheWriteTokens", 0)) + int(ag_tokens.get("cacheReadTokens", 0))
    output_tokens = int(codex_tokens.get("outputTokens", 0)) + int(ag_tokens.get("outputTokens", 0))
    reasoning_tokens = int(codex_tokens.get("reasoningTokens", 0)) + int(ag_tokens.get("thinkingOutputTokens", 0))
    first_active = date.fromisoformat(active_dates[0]) if active_dates else None
    eligible_start = max(start, first_active) if first_active else None
    eligible_days = (end - eligible_start).days + 1 if eligible_start else 0
    platform_label = "＋".join(source["label"] for source in sources)
    limitations = []
    if not all_have_segments:
        limitations.append("Some sessions lack activeSegments; cross-platform active-time overlap could not be removed.")
    if antigravity and antigravity["boundarySessionIds"]:
        limitations.append(
            "Antigravity token databases are conversation-level. Sessions spanning the report boundary are flagged for manual inclusion review: "
            + ", ".join(antigravity["boundarySessionIds"])
        )

    result = {
        "schemaVersion": "1.0",
        "period": {"start": start.isoformat(), "end": end.isoformat(), "timezone": "Asia/Taipei"},
        "platformLabel": platform_label,
        "sourceDetection": {
            "mode": "codex-antigravity" if antigravity else "codex-only",
            "codexIncludedSessionCount": selected_counts["codex"],
            "antigravityIncludedSessionCount": selected_counts["antigravity"],
            "rule": "Antigravity is included only when at least one selected work session passes evidence and deduplication checks.",
        },
        "sources": sources,
        "metricsBase": {
            "workRecordCount": sum(source["workRecordCount"] for source in sources),
            "activeDays": len(active_dates),
            "eligibleDays": eligible_days,
            "activeMinutes": active_minutes,
            "totalTokens": total_tokens,
            "inputTokens": input_tokens,
            "outputTokens": output_tokens,
            "reasoningTokens": reasoning_tokens,
        },
        "activeDates": active_dates,
        "activeTimeMethod": active_time_method,
        "tokenDisplayNote": "含 Cached Input／Cache Read｜額度規劃依據" if antigravity else "含 Cached Input｜額度規劃依據",
        "tokenMethodSummary": "Antigravity thinking/response are output subsets and are not added twice." if antigravity else "Codex input may include Cached Input.",
        "limitations": limitations,
    }
    output_path = pathlib.Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output_path), "platformLabel": platform_label, "metricsBase": result["metricsBase"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
