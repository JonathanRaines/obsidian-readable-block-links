# Readable Block Links

When you link to a block with Obsidian's suggester (`[[Note#^`), Obsidian creates a random ID like `^abc123`. This plugin replaces that ID with a slug made from the start of the block. It updates both the source note and the link.

```markdown
[[Source note#^abc123]]  →  [[Source note#^some-quote]]
```

- Slugs use the block's first sentence by default. Under Settings → Readable Block Links you can instead limit it to a number of words or sentences (defaults: 3 words, 1 sentence) or use the whole block. Markdown syntax (quotes, lists, callouts, links) is stripped out.
- If the slug is already used in that note, `-2`, `-3`, … is added to the end.
- An ID is only renamed if no other note links to it yet.

## Install

```sh
npm install
npm run build
```

Copy `main.js` and `manifest.json` to `<vault>/.obsidian/plugins/readable-block-links/`, then enable the plugin under Settings → Community plugins.
