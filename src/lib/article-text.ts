import sanitizeHtml from "sanitize-html";

export const FENCE_TAGS = ["article", "existing-topics"] as const;

const BLOCK_TAGS = [
    "p",
    "div",
    "li",
    "tr",
    "td",
    "th",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "pre",
    "blockquote",
    "ul",
    "ol",
    "table",
    "thead",
    "tbody",
    "tfoot",
    "article",
    "section",
    "header",
    "footer",
    "figure",
    "figcaption",
    "br",
];

const DROPPED_WITH_CONTENT = [
    "script",
    "style",
    "noscript",
    "template",
    "iframe",
    "svg",
    "head",
    "object",
    "embed",
];

const BLOCK_TAG_PATTERN = new RegExp(`</?(?:${BLOCK_TAGS.join("|")})\\s*/?>`, "gi");

const FENCE_TAG_PATTERN = new RegExp(`</?(?:${FENCE_TAGS.join("|")})\\s*/?>`, "gi");

const MIN_BLANK_RUN_TO_COLLAPSE = 3;

const ESCAPED_ENTITIES: [pattern: RegExp, char: string][] = [
    [/&lt;/g, "<"],
    [/&gt;/g, ">"],
    [/&quot;/g, '"'],
    [/&#39;/g, "'"],
    [/&amp;/g, "&"],
];

const decodeEscapedEntities = (text: string): string =>
    ESCAPED_ENTITIES.reduce(
        (decoded, [pattern, char]) => decoded.replace(pattern, char),
        text,
    );

const collapseBlankLines = (text: string): string => {
    const lines = text.split("\n").map((line) => line.trimEnd());
    const collapsed: string[] = [];
    let blankRun = 0;

    for (const line of lines) {
        if (line.length === 0) {
            blankRun++;
            continue;
        }

        if (blankRun > 0) {
            const kept = blankRun >= MIN_BLANK_RUN_TO_COLLAPSE ? 1 : blankRun;

            collapsed.push(...Array<string>(kept).fill(""));
            blankRun = 0;
        }

        collapsed.push(line);
    }

    return collapsed.join("\n");
};

export const extractArticleText = (html: string): string => {
    const safeFragment = sanitizeHtml(html, {
        allowedTags: BLOCK_TAGS,
        allowedAttributes: {},
        nonTextTags: DROPPED_WITH_CONTENT,
    });

    const withNewlines = safeFragment.replace(BLOCK_TAG_PATTERN, "\n");
    const decoded = decodeEscapedEntities(withNewlines);
    const collapsed = collapseBlankLines(decoded).trim();
    const withoutFences = collapsed.replace(FENCE_TAG_PATTERN, "");

    return withoutFences.trim();
};

export const countWords = (text: string): number => {
    const trimmed = text.trim();

    return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
};
