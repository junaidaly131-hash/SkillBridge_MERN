// Shared chat rules. Kept here so the socket handlers, the REST routes and the
// frontend all answer to one definition rather than three copies that drift.

/**
 * Reactions people may leave on a message.
 *
 * A fixed list rather than "any emoji the client sends": `emoji` is stored and
 * rendered straight back to the other participant, so an open field is a way to
 * put arbitrary text - including something that is not an emoji at all - into
 * someone else's chat window.
 */
export const ALLOWED_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export const isAllowedReaction = (emoji) => ALLOWED_REACTIONS.includes(emoji);

/**
 * How long after sending a message its text may still be changed.
 *
 * Short on purpose. Editing exists to fix a typo, not to rewrite what the other
 * person already read and replied to - and in a chat where people agree session
 * times and prices, silently changing an old message is the thing to avoid. The
 * bubble is marked "edited" either way.
 */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

export const MAX_MESSAGE_LENGTH = 4000;
