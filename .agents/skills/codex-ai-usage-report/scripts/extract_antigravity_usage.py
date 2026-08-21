import argparse
import json
import pathlib
import re
import sqlite3
from collections import Counter
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo


TOKEN_KEYS = (
    "inputTokens",
    "outputTokens",
    "cacheWriteTokens",
    "cacheReadTokens",
    "thinkingOutputTokens",
    "responseOutputTokens",
)


def read_varint(data, offset):
    value = 0
    shift = 0
    while offset < len(data) and shift < 70:
        byte = data[offset]
        offset += 1
        value |= (byte & 0x7F) << shift
        if byte < 0x80:
            return value, offset
        shift += 7
    raise ValueError("invalid protobuf varint")


def parse_proto(data):
    offset = 0
    fields = []
    while offset < len(data):
        key, offset = read_varint(data, offset)
        number = key >> 3
        wire_type = key & 7
        if number == 0:
            raise ValueError("invalid protobuf field")
        if wire_type == 0:
            value, offset = read_varint(data, offset)
        elif wire_type == 1:
            if offset + 8 > len(data):
                raise ValueError("truncated fixed64")
            value = data[offset : offset + 8]
            offset += 8
        elif wire_type == 2:
            size, offset = read_varint(data, offset)
            if offset + size > len(data):
                raise ValueError("truncated bytes")
            value = data[offset : offset + size]
            offset += size
        elif wire_type == 5:
            if offset + 4 > len(data):
                raise ValueError("truncated fixed32")
            value = data[offset : offset + 4]
            offset += 4
        else:
            raise ValueError(f"unsupported protobuf wire type {wire_type}")
        fields.append((number, wire_type, value))
    return fields


def first_bytes(fields, number):
    return next((value for field, wire, value in fields if field == number and wire == 2), None)


def varints(fields):
    return {field: value for field, wire, value in fields if wire == 0}


def empty_token_totals():
    return {key: 0 for key in TOKEN_KEYS} | {"totalTokens": 0}


def extract_model_usage(db_path):
    totals = Counter()
    models = Counter()
    providers = Counter()
    row_count = 0
    decoded_count = 0
    decode_errors = 0
    connection = sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True)
    try:
        for (blob,) in connection.execute("select data from gen_metadata where data is not null order by idx"):
            row_count += 1
            try:
                outer = parse_proto(bytes(blob))
                generation_blob = first_bytes(outer, 1)
                if generation_blob is None:
                    continue
                generation = parse_proto(generation_blob)
                usage_blob = first_bytes(generation, 4)
                if usage_blob is None:
                    continue
                usage = varints(parse_proto(usage_blob))
            except (TypeError, ValueError):
                decode_errors += 1
                continue
            models[str(usage.get(1, 0))] += 1
            providers[str(usage.get(6, 0))] += 1
            totals["inputTokens"] += usage.get(2, 0)
            totals["outputTokens"] += usage.get(3, 0)
            totals["cacheWriteTokens"] += usage.get(4, 0)
            totals["cacheReadTokens"] += usage.get(5, 0)
            totals["thinkingOutputTokens"] += usage.get(9, 0)
            totals["responseOutputTokens"] += usage.get(10, 0)
            decoded_count += 1
    finally:
        connection.close()
    normalized = empty_token_totals()
    normalized.update(totals)
    normalized["totalTokens"] = (
        normalized["inputTokens"]
        + normalized["outputTokens"]
        + normalized["cacheWriteTokens"]
        + normalized["cacheReadTokens"]
    )
    output_subsets_reconcile = normalized["outputTokens"] == (
        normalized["thinkingOutputTokens"] + normalized["responseOutputTokens"]
    )
    return {
        "rowCount": row_count,
        "decodedCount": decoded_count,
        "decodeErrors": decode_errors,
        "tokens": normalized,
        "outputSubsetsReconcile": output_subsets_reconcile,
        "modelEnums": dict(models),
        "apiProviders": dict(providers),
    }


def parse_timestamp(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def clip(value, limit=700):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text if len(text) <= limit else text[: limit - 1] + "…"


def calculate_activity(timestamps):
    if not timestamps:
        return 0, []
    values = sorted(set(timestamps))
    raw_segments = []
    start = values[0]
    previous = values[0]
    for current in values[1:]:
        if current - previous > timedelta(minutes=15):
            raw_segments.append((start, previous))
            start = current
        previous = current
    raw_segments.append((start, previous))
    segments = []
    minutes = 0
    for seg_start, seg_end in raw_segments:
        duration = max(2, round((seg_end - seg_start).total_seconds() / 60, 1))
        minutes += duration
        segments.append({
            "start": seg_start.isoformat(),
            "end": seg_end.isoformat(),
            "minutes": duration,
        })
    return round(minutes, 1), segments


def skill_from_path(value):
    if not value:
        return None
    normalized = str(value).strip().strip("'\"").replace("/", "\\")
    if not normalized.lower().endswith("\\skill.md"):
        return None
    parts = [part for part in normalized.split("\\") if part]
    name = parts[-2] if len(parts) >= 2 else ""
    return name if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{1,80}", name) else None


def transcript_path_for(brain_root, session_id):
    candidates = (
        brain_root / session_id / ".system_generated" / "logs" / "transcript.jsonl",
        brain_root / session_id / ".system_generated" / "transcript.jsonl",
    )
    return next((path for path in candidates if path.exists()), None)


def main():
    parser = argparse.ArgumentParser(description="Extract local Antigravity usage evidence.")
    parser.add_argument("--root", default=str(pathlib.Path.home() / ".gemini" / "antigravity"))
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True)
    parser.add_argument("--timezone", default="Asia/Taipei")
    parser.add_argument("--output", required=True)
    parser.add_argument("--index")
    args = parser.parse_args()

    root = pathlib.Path(args.root).expanduser().resolve()
    conversations = root / "conversations"
    brain = root / "brain"
    if not conversations.is_dir() or not brain.is_dir():
        raise FileNotFoundError(f"Antigravity conversations/brain directories not found under {root}")
    timezone = ZoneInfo(args.timezone)
    start_date = datetime.fromisoformat(args.start.replace("/", "-")).date()
    end_date = datetime.fromisoformat(args.end.replace("/", "-")).date()
    if start_date > end_date:
        raise ValueError("--start must not be after --end")
    sessions = []
    skipped_missing_transcript = 0
    transcript_read_errors = 0
    database_read_errors = 0

    for db_path in sorted(conversations.glob("*.db")):
        session_id = db_path.stem
        transcript_path = transcript_path_for(brain, session_id)
        if transcript_path is None:
            skipped_missing_transcript += 1
            continue
        all_events = []
        period_events = []
        try:
            lines = transcript_path.read_text(encoding="utf-8").splitlines()
        except OSError:
            transcript_read_errors += 1
            continue
        for line in lines:
            if not line.strip():
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                transcript_read_errors += 1
                continue
            timestamp = parse_timestamp(event.get("created_at"))
            if timestamp is None:
                continue
            local_time = timestamp.astimezone(timezone)
            event["_timestamp"] = timestamp
            event["_localTime"] = local_time.isoformat()
            all_events.append(event)
            if start_date <= local_time.date() <= end_date:
                period_events.append(event)
        if not period_events:
            continue

        user_inputs = []
        tool_names = Counter()
        paths = []
        cwd_values = []
        skills = set()
        timestamps = []
        event_types = Counter()
        for event in period_events:
            timestamps.append(event["_timestamp"])
            event_types[event.get("type") or "UNKNOWN"] += 1
            if event.get("type") == "USER_INPUT" and isinstance(event.get("content"), str):
                user_inputs.append(clip(event["content"]))
            for tool_call in event.get("tool_calls") or []:
                name = tool_call.get("name") or "unknown"
                tool_names[name] += 1
                tool_args = tool_call.get("args") or {}
                if not isinstance(tool_args, dict):
                    continue
                for key in ("Cwd", "AbsolutePath", "TargetFile", "DirectoryPath", "SearchDirectory", "SearchPath"):
                    value = tool_args.get(key)
                    if value:
                        paths.append(str(value))
                        if key == "Cwd":
                            cwd_values.append(str(value))
                        detected = skill_from_path(value)
                        if detected:
                            skills.add(detected)
                if tool_args.get("IsSkillFile"):
                    detected = skill_from_path(tool_args.get("AbsolutePath"))
                    if detected:
                        skills.add(detected)

        try:
            usage = extract_model_usage(db_path)
        except (OSError, sqlite3.DatabaseError, ValueError) as error:
            database_read_errors += 1
            usage = {
                "rowCount": 0,
                "decodedCount": 0,
                "decodeErrors": 1,
                "tokens": empty_token_totals(),
                "outputSubsetsReconcile": False,
                "modelEnums": {},
                "apiProviders": {},
                "readError": str(error),
            }
        active_minutes, active_segments = calculate_activity(timestamps)
        all_dates = sorted({event["_localTime"][:10] for event in all_events})
        boundary_spanning = bool(all_dates and (all_dates[0] < args.start.replace("/", "-") or all_dates[-1] > args.end.replace("/", "-")))
        sessions.append({
            "sessionId": session_id,
            "startLocal": min(event["_localTime"] for event in period_events),
            "endLocal": max(event["_localTime"] for event in period_events),
            "transcriptStartLocal": min(event["_localTime"] for event in all_events),
            "transcriptEndLocal": max(event["_localTime"] for event in all_events),
            "activeDates": sorted({event["_localTime"][:10] for event in period_events}),
            "activeMinutes": active_minutes,
            "activeSegments": active_segments,
            "boundarySpanning": boundary_spanning,
            "eventCount": len(period_events),
            "eventTypes": dict(event_types),
            "userInputCount": len(user_inputs),
            "userInputs": user_inputs,
            "toolNames": dict(tool_names),
            "skills": sorted(skills),
            "cwdValues": sorted(set(cwd_values)),
            "pathHints": sorted(set(paths))[:100],
            "modelUsage": usage,
        })

    result = {
        "schemaVersion": "1.1",
        "generatedAt": datetime.now().astimezone().isoformat(),
        "source": "Antigravity local conversation databases and brain transcripts",
        "sourceRoot": str(root),
        "privacy": "Intermediate local evidence only. Do not attach this JSON to the final PPT or email.",
        "period": {"start": args.start.replace("/", "-"), "end": args.end.replace("/", "-"), "timezone": args.timezone},
        "activeTimeMethod": "Interaction timestamps are split when gaps exceed 15 minutes; each segment contributes at least 2 minutes.",
        "tokenMethod": "ModelUsageStats fields from each included conversation database; output includes thinking and response subsets, which are not added again.",
        "sessionCount": len(sessions),
        "skippedMissingTranscript": skipped_missing_transcript,
        "transcriptReadErrors": transcript_read_errors,
        "databaseReadErrors": database_read_errors,
        "sessions": sessions,
    }
    output_path = pathlib.Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if args.index:
        header = [
            "session_id", "start_local", "user_inputs", "active_minutes", "input_tokens",
            "output_tokens", "cache_read_tokens", "skills", "cwd", "first_user_input",
        ]
        rows = ["\t".join(header)]
        for session in sessions:
            tokens = session["modelUsage"]["tokens"]
            rows.append("\t".join([
                session["sessionId"],
                session["startLocal"],
                str(session["userInputCount"]),
                str(session["activeMinutes"]),
                str(tokens.get("inputTokens", 0)),
                str(tokens.get("outputTokens", 0)),
                str(tokens.get("cacheReadTokens", 0)),
                ",".join(session["skills"]),
                clip(" | ".join(session["cwdValues"]), 180),
                clip(session["userInputs"][0] if session["userInputs"] else "", 260),
            ]))
        index_path = pathlib.Path(args.index)
        index_path.parent.mkdir(parents=True, exist_ok=True)
        index_path.write_text("\n".join(rows) + "\n", encoding="utf-8")

    print(json.dumps({
        "output": str(output_path),
        "sessionsReturned": len(sessions),
        "databaseReadErrors": database_read_errors,
        "transcriptReadErrors": transcript_read_errors,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
