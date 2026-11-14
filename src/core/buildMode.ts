/** Build mode (Apollo changing the site's own code) is ON HOLD at Reg's request: it was too slow and
 *  unreliable. While on hold no new builds start; Discard / Revert / Ship of existing ones still work.
 *  Code changes go through Claude Code directly instead. Flip to false to bring it back. */
export const BUILD_ON_HOLD = true;
export const ON_HOLD_NOTE = "Build mode is on hold. Ask Claude Code directly for code changes.";
