/**
 * Interface representing a location where a match was found
 */
export interface MatchLocation {
  file: string;
  line: number;
  context: string;
}

/**
 * Interface representing a search match result from w2vgrep
 */
export interface SearchMatch {
  similarity: number;
  line: number;
  match: string;
  context: string[];
  locations?: MatchLocation[];
}

/**
 * Removes ANSI escape codes from a string.
 * ANSI codes are used for terminal coloring/formatting (e.g., \x1b[31m for red).
 *
 * @param str - The string potentially containing ANSI escape codes
 * @returns The string with all ANSI escape codes removed
 */
export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Parses the output from w2vgrep CLI into structured SearchMatch objects.
 *
 * w2vgrep output format:
 * ```
 * Similarity: 0.5242
 * 24: line content here
 * 25: another line
 * --
 * Similarity: 1.0000
 * 59: next match line
 * ```
 *
 * @param output - Raw output string from w2vgrep command
 * @returns Array of SearchMatch objects parsed from the output
 */
export function parseW2vgrepOutput(output: string): SearchMatch[] {
  const matches: SearchMatch[] = [];
  const cleaned = stripAnsi(output);
  const blocks = cleaned.split("--\n").filter(Boolean);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length === 0) continue;

    // First line should be "Similarity: X.XXXX"
    const simMatch = lines[0].match(/Similarity:\s*([\d.]+)/);
    if (!simMatch) continue;

    const similarity = parseFloat(simMatch[1]);
    const contextLines: string[] = [];
    let matchLine = 0;
    let matchWord = "";

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Parse "123: text content"
      const lineMatch = line.match(/^(\d+):\s*(.*)$/);
      if (lineMatch) {
        const lineNum = parseInt(lineMatch[1]);
        const content = lineMatch[2];
        contextLines.push(`${lineNum}: ${content}`);

        // The line with highest similarity score is typically in the middle
        // w2vgrep marks matched words, but we stripped ANSI, so find the middle line
        if (i === Math.ceil(lines.length / 2)) {
          matchLine = lineNum;
          matchWord = content;
        }
      }
    }

    // Find the actual match line (middle of context)
    if (contextLines.length > 0) {
      const midIndex = Math.floor(contextLines.length / 2);
      const midLine = contextLines[midIndex];
      const midMatch = midLine.match(/^(\d+):\s*(.*)$/);
      if (midMatch) {
        matchLine = parseInt(midMatch[1]);
        matchWord = midMatch[2];
      }
    }

    matches.push({
      similarity,
      line: matchLine,
      match: matchWord,
      context: contextLines,
    });
  }

  return matches;
}

/**
 * Expands tilde (~) to home directory in a path.
 *
 * @param filePath - Path that may contain ~ at the beginning
 * @returns Path with ~ expanded to home directory
 */
export function expandTilde(filePath: string): string {
  if (filePath.startsWith("~/")) {
    return filePath.replace("~", process.env.HOME || "");
  }
  if (filePath === "~") {
    return process.env.HOME || "";
  }
  return filePath;
}

/**
 * Converts an absolute file path to a relative path based on a base directory.
 *
 * @param filePath - The absolute file path to convert
 * @param basePath - The base directory path to make the path relative to
 * @returns The relative path if filePath starts with basePath, otherwise the original filePath
 */
export function relativePath(filePath: string, basePath: string): string {
  // Handle exact match
  if (filePath === basePath) {
    return "";
  }
  const base = basePath.endsWith("/") ? basePath : basePath + "/";
  if (filePath.startsWith(base)) {
    return filePath.slice(base.length);
  }
  return filePath;
}

/**
 * Escapes special characters for use in shell commands.
 * Double quotes and backslashes need escaping inside double-quoted strings.
 *
 * @param str - The string to escape
 * @returns The escaped string safe for shell usage
 */
export function escapeForShell(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$").replace(/`/g, "\\`");
}

/**
 * Parses ripgrep output with context to extract file locations.
 * Ripgrep output format with -n -C:
 * - Matching lines: "file:line:content"
 * - Context lines: "file-line-content"
 * - Blocks separated by "--"
 *
 * @param output - Raw output from ripgrep command
 * @param basePath - Base path for relative path calculation
 * @returns Array of MatchLocation objects with context
 */
export function parseRipgrepOutput(output: string, basePath: string): MatchLocation[] {
  const locations: MatchLocation[] = [];
  const blocks = output.trim().split("\n--\n");

  for (const block of blocks) {
    if (!block.trim()) continue;

    const lines = block.split("\n");
    const contextLines: Array<{ num: number; text: string }> = [];
    let matchFile = "";
    let matchLine = 0;

    for (const line of lines) {
      if (!line) continue;

      // Match line format: file:line:content (colon after line number)
      const matchResult = line.match(/^(.+?):(\d+):(.*)$/);
      if (matchResult) {
        matchFile = relativePath(matchResult[1], basePath);
        matchLine = parseInt(matchResult[2]);
        contextLines.push({ num: parseInt(matchResult[2]), text: matchResult[3] });
        continue;
      }

      // Context line format: file-line-content (dash after line number)
      const contextResult = line.match(/^(.+?)-(\d+)-(.*)$/);
      if (contextResult) {
        contextLines.push({ num: parseInt(contextResult[2]), text: contextResult[3] });
      }
    }

    if (matchFile && matchLine > 0) {
      // Sort context by line number, then extract just the text
      contextLines.sort((a, b) => a.num - b.num);

      locations.push({
        file: matchFile,
        line: matchLine,
        context: contextLines.map(c => c.text).join("\n"),
      });
    }
  }

  return locations;
}
