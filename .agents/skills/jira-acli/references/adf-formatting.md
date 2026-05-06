# Atlassian Document Format (ADF) Reference

Jira does NOT render markdown. All descriptions and comments must use ADF (JSON).
Use `--description-file <path.json>` (for create) or `--description-file <path.json>` (for edit) to pass ADF content.

**Never use `--description` with raw markdown** -- it renders as unformatted plain text with visible `##`, `|---|`, and backtick characters.

## ADF Document Skeleton

Every ADF document starts with:

```json
{
  "version": 1,
  "type": "doc",
  "content": [
    /* block nodes here */
  ]
}
```

## Block Nodes

### Heading

```json
{
  "type": "heading",
  "attrs": { "level": 2 },
  "content": [{ "type": "text", "text": "My Heading" }]
}
```

Levels: 1-6.

### Paragraph

```json
{
  "type": "paragraph",
  "content": [{ "type": "text", "text": "Plain paragraph text." }]
}
```

### Bullet List

```json
{
  "type": "bulletList",
  "content": [
    {
      "type": "listItem",
      "content": [
        {
          "type": "paragraph",
          "content": [{ "type": "text", "text": "Item one" }]
        }
      ]
    }
  ]
}
```

### Ordered List

```json
{
  "type": "orderedList",
  "attrs": { "order": 1 },
  "content": [
    {
      "type": "listItem",
      "content": [
        {
          "type": "paragraph",
          "content": [{ "type": "text", "text": "Step one" }]
        }
      ]
    }
  ]
}
```

### Table

```json
{
  "type": "table",
  "attrs": { "isNumberColumnEnabled": false, "layout": "default" },
  "content": [
    {
      "type": "tableRow",
      "content": [
        {
          "type": "tableHeader",
          "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Column A" }] }]
        },
        {
          "type": "tableHeader",
          "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Column B" }] }]
        }
      ]
    },
    {
      "type": "tableRow",
      "content": [
        {
          "type": "tableCell",
          "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "value 1" }] }]
        },
        {
          "type": "tableCell",
          "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "value 2" }] }]
        }
      ]
    }
  ]
}
```

### Code Block

```json
{
  "type": "codeBlock",
  "attrs": { "language": "typescript" },
  "content": [{ "type": "text", "text": "const x = 1;" }]
}
```

### Rule (Horizontal Divider)

```json
{ "type": "rule" }
```

### Panel (Info / Note / Warning / Error / Success)

```json
{
  "type": "panel",
  "attrs": { "panelType": "info" },
  "content": [
    {
      "type": "paragraph",
      "content": [{ "type": "text", "text": "This is an info panel." }]
    }
  ]
}
```

`panelType` values: `info`, `note`, `warning`, `error`, `success`.

## Inline Marks

Apply marks to text nodes to style them:

### Bold

```json
{ "type": "text", "text": "bold text", "marks": [{ "type": "strong" }] }
```

### Italic

```json
{ "type": "text", "text": "italic text", "marks": [{ "type": "em" }] }
```

### Inline Code

```json
{ "type": "text", "text": "code text", "marks": [{ "type": "code" }] }
```

### Link

```json
{ "type": "text", "text": "click here", "marks": [{ "type": "link", "attrs": { "href": "https://example.com" } }] }
```

### Combined Marks

Marks compose -- use an array:

```json
{ "type": "text", "text": "bold code", "marks": [{ "type": "strong" }, { "type": "code" }] }
```

## Composing Rich Paragraphs

Mix styled and unstyled text nodes in a single paragraph:

```json
{
  "type": "paragraph",
  "content": [
    { "type": "text", "text": "Run " },
    { "type": "text", "text": "npm install", "marks": [{ "type": "code" }] },
    { "type": "text", "text": " to install dependencies." }
  ]
}
```

## Gotchas

- Every `tableCell` and `tableHeader` must contain at least one block node (usually a `paragraph`).
- `listItem` must contain at least one block node (usually a `paragraph`).
- Empty cells: use `{ "type": "paragraph", "content": [{ "type": "text", "text": " " }] }` (space char) or `{ "type": "paragraph" }` (empty).
- The `--description` flag on `acli` accepts ADF JSON as a string, but for anything non-trivial, always write to a temp file and use `--description-file`.
