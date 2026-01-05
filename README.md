# mcp-w2vgrep

MCP server for semantic search using [w2vgrep](https://github.com/arunsupe/semantic-grep) and Word2Vec embeddings.

Unlike regular grep, finds **semantically similar** words. Searching for "fear" also finds "anxiety", "terror", "dread".

## Docker (Recommended)

### Build

```bash
docker compose build
```

### Configuration

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "w2vgrep": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-v", "/path/to/.config/semantic-grep:/app/models:ro",
        "-v", "/path/to/search/directory:/search:ro",
        "-e", "DOWNLOAD_MODELS=none",
        "mcp-w2vgrep-mcp-w2vgrep:latest"
      ]
    }
  }
}
```

Replace:
- `/path/to/.config/semantic-grep` — directory with Word2Vec models
- `/path/to/search/directory` — directory to search in

### First Run (Download Models)

If you don't have models, the container will download them on first run:

```bash
# Download English model (~2.3GB)
DOWNLOAD_MODELS=english docker compose up

# Download Russian model (~2.3GB)
DOWNLOAD_MODELS=russian docker compose up

# Download both
DOWNLOAD_MODELS=english,russian docker compose up
```

Models are saved to the `models` Docker volume.

## Native Installation

### Requirements

- [w2vgrep](https://github.com/arunsupe/semantic-grep) binary
- [ripgrep](https://github.com/BurntSushi/ripgrep) (`rg`)
- Word2Vec model files (`.bin`)
- Node.js 18+

### Getting Word2Vec Models

```bash
mkdir -p ~/.config/semantic-grep

# English (2.3GB)
curl -L https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.en.300.bin.gz | \
  gunzip > ~/.config/semantic-grep/english.bin

# Russian (2.3GB)
curl -L https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.ru.300.bin.gz | \
  gunzip > ~/.config/semantic-grep/russian.bin
```

### Installation

```bash
git clone <repo-url> mcp-w2vgrep
cd mcp-w2vgrep
npm install
npm run build
```

### Configuration

Add to `~/.claude/settings.json`:

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
| `query` | string | yes | Search query (single word recommended, phrases may crash) |
| `model_path` | string | yes | Path to Word2Vec model (.bin) |
| `threshold` | number | no | Similarity threshold (default: 0.7) |
| `glob` | string | no | File pattern (default: `*.md`) |
| `context` | integer | no | Lines of context (default: 2, set to 0 to reduce output) |
| `ignore_case` | boolean | no | Case-insensitive search |

**Docker note:** Search path is always `/search` (mounted volume), recursive search is always enabled.

### Threshold Guide

| Value | Result |
|-------|--------|
| 0.7 | Strict — only very close matches (default) |
| 0.5-0.6 | Balanced — good for most use cases |
| 0.4 | Broad — more results, some noise |
| < 0.5 | **WARNING: Can return MASSIVE amounts of data (millions of characters)!** |

## Usage Examples

### Basic search (Russian)

```json
{
  "query": "тревога",
  "model_path": "~/.config/semantic-grep/russian.bin"
}
```

### Search with lower threshold

```json
{
  "query": "happiness",
  "model_path": "~/.config/semantic-grep/english.bin",
  "threshold": 0.5
}
```

### Reduce output size

```json
{
  "query": "error",
  "model_path": "~/.config/semantic-grep/english.bin",
  "threshold": 0.6,
  "context": 0
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
          "context": "..."
        }
      ]
    }
  ]
}
```

Matches sorted by similarity (highest first). `similarity: 1.0` = exact match.

## Development

```bash
npm test           # Run tests
npm run test:watch # Watch mode
npm run build      # Build TypeScript
```

## License

MIT
