/**
 * Product switches for Open Space.
 *
 * Each switch hides a whole feature from the interface while leaving its code
 * in place, so bringing one back is a one-line change here rather than a
 * revert across a dozen files.
 */

/**
 * Talking to the orchestrator in real time ("Talk" on its card, the voice cost
 * meter, the Realtime section of Settings → Voice). It runs on OpenAI's
 * Realtime API, billed per use on the user's own OpenAI key, so Open Space
 * ships without it. Free Flow dictation (Groq, free tier) is separate and stays.
 */
export const REALTIME_VOICE = false;
