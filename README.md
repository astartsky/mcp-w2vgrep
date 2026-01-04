# mcp-w2vgrep

MCP server for semantic search using [w2vgrep](https://github.com/arunsupe/semantic-grep) and Word2Vec embeddings.

Unlike regular grep, finds **semantically similar** words. Searching for "fear" also finds "anxiety", "terror", "dread".

## Requirements

- [w2vgrep](https://github.com/arunsupe/semantic-grep) binary installed
- [ripgrep](https://github.com/BurntSushi/ripgrep) (`rg`) for locating matches in files
- Word2Vec model files (`.bin` format)
- Node.js 18+

### Getting Word2Vec Models

Download pre-trained FastText models:

```bash
# Create config directory
mkdir -p ~/.config/semantic-grep

# Download English model (2.3GB)
curl -L https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.en.300.bin.gz | \
  gunzip > ~/.config/semantic-grep/english.bin

# Download Russian model (2.3GB)
curl -L https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.ru.300.bin.gz | \
  gunzip > ~/.config/semantic-grep/russian.bin
```

## Installation

```bash
git clone <repo-url> mcp-w2vgrep
cd mcp-w2vgrep
npm install
npm run build
```

## Configuration

Add to your Claude Code MCP settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "w2vgrep": {
      "command": "node",
      "args": ["/path/to/mcp-w2vgrep/dist/index.js"]
    }
  }
}
```

If `w2vgrep` is not in your PATH, specify its location:

```json
{
  "mcpServers": {
    "w2vgrep": {
      "command": "node",
      "args": ["/path/to/mcp-w2vgrep/dist/index.js"],
      "env": {
        "W2VGREP_PATH": "/path/to/w2vgrep"
      }
    }
  }
}
```

## Tool: `semantic_search`

Semantic search in text files using Word2Vec embeddings.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | yes | Search query (word or phrase) |
| `path` | string | yes | Path to file or directory |
| `model_path` | string | yes | Path to Word2Vec model (.bin) |
| `threshold` | number | no | Similarity threshold (0.0-1.0, default: 0.7) |
| `recursive` | boolean | no | Search directories recursively |
| `glob` | string | no | File pattern for recursive search (default: `*.md`) |
| `context` | integer | no | Lines of context before/after (default: 2) |
| `ignore_case` | boolean | no | Case-insensitive search |

### Threshold Guide

| Value | Result |
|-------|--------|
| 0.7 | Strict — only very close matches (default) |
| 0.5-0.6 | Balanced — good for most use cases |
| 0.4 | Broad — more results, some noise |
| 0.3 | Very broad — maximum recall |

## Usage Examples

### Search single file (English)

```json
{
  "query": "happiness",
  "path": "/path/to/document.md",
  "model_path": "~/.config/semantic-grep/english.bin",
  "threshold": 0.5
}
```

### Recursive search in directory (Russian)

```json
{
  "query": "путешествие",
  "path": "/path/to/notes",
  "model_path": "~/.config/semantic-grep/russian.bin",
  "recursive": true,
  "glob": "*.md",
  "threshold": 0.5
}
```

### Search with more context

```json
{
  "query": "error",
  "path": "/path/to/logs",
  "model_path": "~/.config/semantic-grep/english.bin",
  "recursive": true,
  "glob": "*.log",
  "context": 5,
  "threshold": 0.6
}
```

## Response Format

```json
{
  "query": "fear",
  "total": 2,
  "matches": [
    {
      "similarity": 1.0,
      "match": "The fear of failure...",
      "locations": [
        {
          "file": "notes/psychology.md",
          "line": 42,
          "context": "Context before\nThe fear of failure...\nContext after"
        }
      ]
    },
    {
      "similarity": 0.72,
      "match": "Anxiety about the future",
      "locations": [
        {
          "file": "diary/2024-01.md",
          "line": 15,
          "context": "...\nAnxiety about the future\n..."
        },
        {
          "file": "notes/emotions.md",
          "line": 88,
          "context": "...\nAnxiety about the future\n..."
        }
      ]
    }
  ]
}
```

Matches are sorted by similarity (highest first). `similarity: 1.0` means exact match.

For recursive search, `locations` contains all files where the matched text was found, with surrounding context.

## Development

```bash
npm test           # Run tests
npm run test:watch # Watch mode
npm run build      # Build TypeScript
```

## License

MIT
