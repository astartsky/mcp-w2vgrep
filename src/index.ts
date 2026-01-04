#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { execSync } from "child_process";
import { parseW2vgrepOutput, expandTilde, SearchMatch, MatchLocation, escapeForShell, parseRipgrepOutput } from "./utils.js";

const W2VGREP_PATH = process.env.W2VGREP_PATH || "w2vgrep";

const server = new Server(
  { name: "w2vgrep", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "semantic_search",
      description: `Semantic search in text files using Word2Vec embeddings.
Unlike grep, finds semantically similar words (e.g., searching "fear" also finds "anxiety", "terror", "dread").

Use cases:
- Find all mentions of a concept across files
- Search for synonyms and related terms
- Explore themes in documents

Response format:
{
  "query": "search term",
  "total": 5,
  "matches": [{
    "similarity": 0.85,
    "match": "matched text",
    "locations": [{
      "file": "path/to/file.md",
      "line": 42,
      "context": "text before\\nmatched text\\ntext after"
    }]
  }]
}

Matches sorted by similarity (1.0 = exact match).
For recursive search, locations contains file paths and context snippets.`,
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (word or phrase)" },
          path: { type: "string", description: "Path to file or directory" },
          model_path: {
            type: "string",
            description:
              "Path to Word2Vec model. Russian: ~/.config/semantic-grep/russian.bin, English: ~/.config/semantic-grep/english.bin",
          },
          threshold: {
            type: "number",
            description: "Similarity: 0.7=strict (default), 0.5-0.6=balanced, 0.4=broad, 0.3=very broad",
          },
          recursive: { type: "boolean", description: "Search directories recursively" },
          glob: { type: "string", description: "File pattern for recursive search (default: *.md)" },
          context: { type: "integer", description: "Lines of context before and after (default: 2)" },
          ignore_case: { type: "boolean", description: "Ignore case" },
        },
        required: ["query", "path", "model_path"],
      },
    },
  ],
}));

interface SearchParams {
  query: string;
  path: string;
  model_path: string;
  threshold?: number;
  recursive?: boolean;
  glob?: string;
  context?: number;
  ignore_case?: boolean;
}


function runW2vgrep(args: string[], filePath: string): string | null {
  try {
    const result = execSync(`${W2VGREP_PATH} ${args.join(" ")} "${filePath}"`, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result;
  } catch (error: unknown) {
    const execError = error as { status?: number };
    if (execError.status === 1) {
      return null;
    }
    throw error;
  }
}

function runW2vgrepRecursive(args: string[], dirPath: string, pattern: string): string | null {
  try {
    // w2vgrep accepts only one file, so we cat all files and pipe to stdin
    const cmd = `find "${dirPath}" -name "${pattern}" -type f -print0 | xargs -0 cat | ${W2VGREP_PATH} ${args.join(" ")}`;
    const result = execSync(cmd, {
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result;
  } catch (error: unknown) {
    const execError = error as { status?: number };
    if (execError.status === 1 || execError.status === 123) {
      return null;
    }
    throw error;
  }
}

function findMatchLocations(matchText: string, searchPath: string, glob?: string, contextLines: number = 2): MatchLocation[] {
  try {
    const escapedText = escapeForShell(matchText);
    const globArg = glob ? `--glob "${glob}"` : "";
    const cmd = `rg -F -n -C ${contextLines} ${globArg} "${escapedText}" "${searchPath}"`;
    const result = execSync(cmd, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return parseRipgrepOutput(result, searchPath);
  } catch (error: unknown) {
    const execError = error as { status?: number };
    // ripgrep returns 1 when no matches found
    if (execError.status === 1) {
      return [];
    }
    // On other errors, return empty array (graceful degradation)
    return [];
  }
}


server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "semantic_search") {
    return { content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }], isError: true };
  }

  const params = request.params.arguments as unknown as SearchParams;
  const modelPath = expandTilde(params.model_path);
  const searchPath = expandTilde(params.path);
  const args: string[] = [];

  args.push("-m", modelPath);

  if (params.threshold !== undefined) {
    args.push("-t", params.threshold.toString());
  }

  args.push("-n");

  const contextLines = params.context ?? 2;
  args.push("-C", contextLines.toString());

  if (params.ignore_case) {
    args.push("-i");
  }

  args.push(params.query);

  try {
    const allMatches: SearchMatch[] = [];
    const pattern = params.glob || "*.md";

    if (params.recursive) {
      const result = runW2vgrepRecursive(args, searchPath, pattern);
      if (result) {
        const matches = parseW2vgrepOutput(result);
        // Enrich matches with exact file locations using ripgrep
        for (const match of matches) {
          match.locations = findMatchLocations(match.match, searchPath, pattern, contextLines);
        }
        allMatches.push(...matches);
      }
    } else {
      const result = runW2vgrep(args, searchPath);
      if (result) {
        const matches = parseW2vgrepOutput(result);
        allMatches.push(...matches);
      }
    }

    // Sort by similarity descending
    allMatches.sort((a, b) => b.similarity - a.similarity);

    const response = {
      query: params.query,
      total: allMatches.length,
      matches: allMatches,
    };

    return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text", text: `Error: ${errorMessage}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
