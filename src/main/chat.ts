/**
 * Read an agent's conversation for the Chat tab.
 *
 * The transcript is Claude Code's session JSONL. Only its tail is read — a long
 * session runs to tens of megabytes and the tab shows the most recent messages —
 * and the parsed result is cached against the file's size and mtime, so the
 * tab's polling costs one stat() while nothing changes.
 */
import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { CHAT_MAX_ITEMS, parseTranscriptLines, type ChatItem } from '../shared/chat';

/** How much of the end of a transcript to read. Comfortably more than the
 *  CHAT_MAX_ITEMS most recent messages, tool calls included. */
const TAIL_BYTES = 4 * 1024 * 1024;
const MAX_CACHED = 64;

const cache = new Map<string, { size: number; mtimeMs: number; items: ChatItem[] }>();

/** The chat items of one transcript, or null when it cannot be read. */
export function readChatItems(transcriptPath: string): ChatItem[] | null {
  try {
    const st = statSync(transcriptPath);
    const hit = cache.get(transcriptPath);
    if (hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs) return hit.items;

    const len = Math.min(st.size, TAIL_BYTES);
    const buf = Buffer.alloc(len);
    const fd = openSync(transcriptPath, 'r');
    try {
      readSync(fd, buf, 0, len, st.size - len);
    } finally {
      closeSync(fd);
    }
    let text = buf.toString('utf8');
    // Reading from the middle of the file lands inside a line (and possibly a
    // multi-byte character): drop everything up to the first full line.
    if (len < st.size) text = text.slice(text.indexOf('\n') + 1);

    const items = parseTranscriptLines(text.split('\n'), CHAT_MAX_ITEMS);
    cache.delete(transcriptPath);
    cache.set(transcriptPath, { size: st.size, mtimeMs: st.mtimeMs, items });
    if (cache.size > MAX_CACHED) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    return items;
  } catch {
    return null;
  }
}
