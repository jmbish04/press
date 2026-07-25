/**
 * Automatic full-article narration is intentionally opt-in because Aura TTS
 * is billed per input character and ingestion can fan one article out into
 * many paid model calls. Manual narration endpoints are unaffected.
 */
export const AUTOMATIC_NARRATION_ENABLED = false;
