import { App, Editor, MarkdownFileInfo, MarkdownView, Plugin, PluginSettingTab, Setting, TFile, parseLinktext } from "obsidian";
import { SlugLimit, slugify, uniqueSlug } from "./slugify";

// Obsidian generates block IDs as six lowercase alphanumerics.
const GENERATED_LINK = /\[\[([^\]|#]*)#\^([a-z0-9]{6})(?:\|[^\]]*)?\]\]/g;
const BLOCK_WAIT_MS = 3000;

interface Settings {
	limit: SlugLimit;
	words: number;
	sentences: number;
}

const DEFAULT_SETTINGS: Settings = { limit: "sentences", words: 3, sentences: 1 };
const LIMIT_OPTIONS: Record<SlugLimit, string> = { words: "Words", sentences: "Sentences", none: "Whole block" };

export default class ReadableBlockLinks extends Plugin {
	settings: Settings = DEFAULT_SETTINGS;
	private seen = new Set<string>();

	async onload() {
		this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
		if (!(this.settings.limit in LIMIT_OPTIONS)) this.settings.limit = DEFAULT_SETTINGS.limit;
		this.addSettingTab(new ReadableBlockLinksSettingTab(this.app, this));
		this.registerEvent(this.app.workspace.on("editor-change", (editor, info) => this.onEditorChange(editor, info)));
	}

	/** Looks for a generated block link touching the cursor, i.e. one just inserted by the link suggester. */
	private onEditorChange(editor: Editor, info: MarkdownView | MarkdownFileInfo) {
		const file = info.file;
		if (!file) return;
		const cursor = editor.getCursor();
		for (const match of editor.getLine(cursor.line).matchAll(GENERATED_LINK)) {
			const start = match.index ?? 0;
			if (cursor.ch < start || cursor.ch > start + match[0].length) continue;
			void this.renameBlock(file, match[1], match[2]);
		}
	}

	private async renameBlock(source: TFile, linkpath: string, id: string) {
		const target = this.app.metadataCache.getFirstLinkpathDest(linkpath, source.path);
		if (!target || target === source) return;
		const key = `${target.path}#^${id}`;
		if (this.seen.has(key)) return;
		this.seen.add(key);

		// The suggester writes the ID into the target note asynchronously.
		const block = await this.waitForBlock(target, id);
		if (!block || this.isReferencedElsewhere(target, id, source)) return;

		const content = await this.app.vault.read(target);
		const { limit } = this.settings;
		const count = limit === "none" ? 0 : this.settings[limit];
		const slug = slugify(content.slice(block.start, block.end), limit, count);
		if (!slug) return;
		const blocks = this.app.metadataCache.getFileCache(target)?.blocks ?? {};
		const newId = uniqueSlug(slug, Object.keys(blocks));

		await this.app.vault.process(target, (data) =>
			data.replace(new RegExp(`(^|\\s)\\^${id}(?=[ \\t]*$)`, "m"), `$1^${newId}`),
		);
		await this.replaceInNote(source, new RegExp(`#\\^${id}(?=[\\]|])`, "g"), `#^${newId}`);
		this.seen.add(`${target.path}#^${newId}`);
	}

	private async waitForBlock(file: TFile, id: string) {
		for (let waited = 0; waited < BLOCK_WAIT_MS; waited += 100) {
			const block = this.app.metadataCache.getFileCache(file)?.blocks?.[id];
			if (block) return { start: block.position.start.offset, end: block.position.end.offset };
			await sleep(100);
		}
	}

	/** True if any note other than `source` already links to the block, so renaming it would break that link. */
	private isReferencedElsewhere(target: TFile, id: string, source: TFile): boolean {
		const subpath = `#^${id}`;
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (file === source) continue;
			const cache = this.app.metadataCache.getFileCache(file);
			for (const ref of [...(cache?.links ?? []), ...(cache?.embeds ?? [])]) {
				if (!ref.link.endsWith(subpath)) continue;
				const { path } = parseLinktext(ref.link);
				const dest = path ? this.app.metadataCache.getFirstLinkpathDest(path, file.path) : file;
				if (dest === target) return true;
			}
		}
		return false;
	}

	/** Edits through an open editor when possible so unsaved changes aren't clobbered. */
	private async replaceInNote(file: TFile, pattern: RegExp, replacement: string) {
		const view = this.app.workspace
			.getLeavesOfType("markdown")
			.map((leaf) => leaf.view)
			.find((v): v is MarkdownView => v instanceof MarkdownView && v.file === file);
		if (!view) {
			await this.app.vault.process(file, (data) => data.replace(pattern, replacement));
			return;
		}
		const editor = view.editor;
		for (let line = 0; line < editor.lineCount(); line++) {
			const text = editor.getLine(line);
			const updated = text.replace(pattern, replacement);
			if (updated !== text) editor.replaceRange(updated, { line, ch: 0 }, { line, ch: text.length });
		}
	}
}

class ReadableBlockLinksSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: ReadableBlockLinks,
	) {
		super(app, plugin);
	}

	display() {
		const { settings } = this.plugin;
		this.containerEl.empty();
		new Setting(this.containerEl)
			.setName("Limit")
			.setDesc("How much of the block to use for the slug.")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(LIMIT_OPTIONS)
					.setValue(settings.limit)
					.onChange(async (value) => {
						settings.limit = value as SlugLimit;
						await this.plugin.saveData(settings);
						this.display();
					}),
			);
		const { limit } = settings;
		if (limit === "none") return;
		new Setting(this.containerEl).setName(`Number of ${limit}`).addText((text) =>
			text.setValue(String(settings[limit])).onChange(async (value) => {
				const n = parseInt(value, 10);
				if (n > 0) {
					settings[limit] = n;
					await this.plugin.saveData(settings);
				}
			}),
		);
	}
}
