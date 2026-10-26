// Sentence-ending punctuation, optionally followed by closing quotes/brackets, then whitespace or end.
const SENTENCE_END = /[.!?]["'”’)\]]*(?:\s|$)/g;

export type SlugLimit = "words" | "sentences" | "none";

/**
 * Turns a markdown block into a valid block ID (letters, numbers, dashes).
 *
 * Args:
 *     block: Markdown source of the block.
 *     limit: Use the first `count` words, the first `count` sentences, or the whole block.
 *     count: Number of words or sentences to keep; ignored when `limit` is "none".
 */
export function slugify(block: string, limit: SlugLimit = "sentences", count = 1): string {
	let plain = block
		.replace(/(^|\s)\^[A-Za-z0-9-]+[ \t]*$/gm, "") // existing block ID
		.replace(/^[ \t]*(?:>[ \t]?)+/gm, "") // quotes and callouts
		.replace(/\[![^\]]*\][+-]?/g, "") // callout type
		.replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[.\][ \t]+)?/gm, "") // list markers and tasks
		.replace(/^[ \t]*#{1,6}[ \t]+/gm, "") // headings
		.replace(/!?\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1") // wikilinks -> display text
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1"); // markdown links -> display text

	if (limit === "sentences") {
		const end = Array.from(plain.matchAll(SENTENCE_END))[count - 1];
		if (end?.index !== undefined) plain = plain.slice(0, end.index);
	}

	const words = plain
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "") // diacritics
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
	return (limit === "words" ? words.slice(0, count) : words).join("-");
}

/** Appends -2, -3, ... to `slug` until it doesn't collide with `taken`. */
export function uniqueSlug(slug: string, taken: Iterable<string>): string {
	const used = new Set(Array.from(taken, (id) => id.toLowerCase()));
	let candidate = slug;
	for (let n = 2; used.has(candidate); n++) candidate = `${slug}-${n}`;
	return candidate;
}
