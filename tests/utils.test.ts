import { describe, it, expect, afterEach } from "vitest";
import { stripAnsi, parseW2vgrepOutput, relativePath, expandTilde, SearchMatch, MatchLocation, escapeForShell, parseRipgrepOutput } from "../src/utils.js";

describe("stripAnsi", () => {
  describe("removes ANSI escape codes", () => {
    it("removes single color code", () => {
      const input = "\x1b[31mred text\x1b[0m";
      const result = stripAnsi(input);
      expect(result).toBe("red text");
    });

    it("removes multiple color codes", () => {
      const input = "\x1b[31mred\x1b[0m and \x1b[32mgreen\x1b[0m";
      const result = stripAnsi(input);
      expect(result).toBe("red and green");
    });

    it("removes bold and other formatting codes", () => {
      const input = "\x1b[1mbold\x1b[0m \x1b[4munderline\x1b[0m";
      const result = stripAnsi(input);
      expect(result).toBe("bold underline");
    });

    it("removes complex color codes with multiple parameters", () => {
      const input = "\x1b[38;2;255;0;0mRGB red\x1b[0m";
      const result = stripAnsi(input);
      expect(result).toBe("RGB red");
    });

    it("removes 256 color codes", () => {
      const input = "\x1b[38;5;196m256 color\x1b[0m";
      const result = stripAnsi(input);
      expect(result).toBe("256 color");
    });
  });

  describe("handles edge cases", () => {
    it("returns empty string for empty input", () => {
      expect(stripAnsi("")).toBe("");
    });

    it("returns unchanged string when no ANSI codes present", () => {
      const input = "plain text without any codes";
      expect(stripAnsi(input)).toBe(input);
    });

    it("handles string with only ANSI codes", () => {
      const input = "\x1b[31m\x1b[0m";
      expect(stripAnsi(input)).toBe("");
    });

    it("handles multiline strings with ANSI codes", () => {
      const input = "\x1b[31mline1\x1b[0m\n\x1b[32mline2\x1b[0m";
      const result = stripAnsi(input);
      expect(result).toBe("line1\nline2");
    });

    it("handles nested or adjacent ANSI codes", () => {
      const input = "\x1b[1m\x1b[31mbold red\x1b[0m\x1b[0m";
      const result = stripAnsi(input);
      expect(result).toBe("bold red");
    });
  });
});

describe("parseW2vgrepOutput", () => {
  describe("parses single block", () => {
    it("parses a single match block with similarity and context lines", () => {
      const output = `Similarity: 0.7500
24: line before
25: the matching line
26: line after`;

      const result = parseW2vgrepOutput(output);

      expect(result).toHaveLength(1);
      expect(result[0].similarity).toBe(0.75);
      expect(result[0].context).toHaveLength(3);
      expect(result[0].context).toContain("24: line before");
      expect(result[0].context).toContain("25: the matching line");
      expect(result[0].context).toContain("26: line after");
    });

    it("extracts the middle line as the match", () => {
      const output = `Similarity: 0.8000
10: context before
11: the actual match
12: context after`;

      const result = parseW2vgrepOutput(output);

      expect(result[0].line).toBe(11);
      expect(result[0].match).toBe("the actual match");
    });

    it("parses exact match with similarity 1.0000", () => {
      const output = `Similarity: 1.0000
59: exact match line`;

      const result = parseW2vgrepOutput(output);

      expect(result[0].similarity).toBe(1.0);
      expect(result[0].line).toBe(59);
    });
  });

  describe("parses multiple blocks", () => {
    it("parses multiple blocks separated by --", () => {
      const output = `Similarity: 0.5242
24: \`\`\`bash
25: # Russian (default)
26: ~/bin/w2vgrep -t 0.5 "тревога" file.txt
27:
28: # English (explicit model path)
--
Similarity: 1.0000
59: \`\`\`bash
60: # Russian text
61: ~/bin/w2vgrep -t 0.5 -n "страх" notes.md`;

      const result = parseW2vgrepOutput(output);

      expect(result).toHaveLength(2);
      expect(result[0].similarity).toBe(0.5242);
      expect(result[0].context).toHaveLength(5);
      expect(result[1].similarity).toBe(1.0);
      expect(result[1].context).toHaveLength(3);
    });

    it("parses blocks with varying context sizes", () => {
      const output = `Similarity: 0.6000
1: single line
--
Similarity: 0.7000
10: line 1
11: line 2
12: line 3
13: line 4
14: line 5`;

      const result = parseW2vgrepOutput(output);

      expect(result).toHaveLength(2);
      expect(result[0].context).toHaveLength(1);
      expect(result[1].context).toHaveLength(5);
    });
  });

  describe("extracts line numbers correctly", () => {
    it("extracts line numbers from format '123: content'", () => {
      const output = `Similarity: 0.9000
100: first line
101: second line
102: third line`;

      const result = parseW2vgrepOutput(output);

      expect(result[0].context[0]).toBe("100: first line");
      expect(result[0].context[1]).toBe("101: second line");
      expect(result[0].context[2]).toBe("102: third line");
    });

    it("handles large line numbers", () => {
      const output = `Similarity: 0.8500
9998: line before
9999: matching line
10000: line after`;

      const result = parseW2vgrepOutput(output);

      expect(result[0].line).toBe(9999);
      expect(result[0].context).toContain("10000: line after");
    });

    it("handles single digit line numbers", () => {
      const output = `Similarity: 0.7000
1: first
2: second
3: third`;

      const result = parseW2vgrepOutput(output);

      expect(result[0].line).toBe(2);
      expect(result[0].context[0]).toBe("1: first");
    });
  });

  describe("handles edge cases", () => {
    it("returns empty array for empty input", () => {
      const result = parseW2vgrepOutput("");
      expect(result).toEqual([]);
    });

    it("returns empty array for whitespace-only input", () => {
      const result = parseW2vgrepOutput("   \n\n  ");
      expect(result).toEqual([]);
    });

    it("ignores blocks without similarity header", () => {
      const output = `Not a valid header
1: some line
--
Similarity: 0.5000
2: valid block`;

      const result = parseW2vgrepOutput(output);

      expect(result).toHaveLength(1);
      expect(result[0].similarity).toBe(0.5);
    });

    it("handles empty lines in context", () => {
      const output = `Similarity: 0.6000
10: line before
11:
12: line after`;

      const result = parseW2vgrepOutput(output);

      expect(result[0].context).toHaveLength(3);
      expect(result[0].context[1]).toBe("11: ");
    });

    it("handles lines with colons in content", () => {
      const output = `Similarity: 0.7500
5: key: value
6: another: thing: here
7: end`;

      const result = parseW2vgrepOutput(output);

      expect(result[0].context[0]).toBe("5: key: value");
      expect(result[0].context[1]).toBe("6: another: thing: here");
    });

    it("strips ANSI codes from output before parsing", () => {
      const output = `\x1b[33mSimilarity: 0.8000\x1b[0m
10: \x1b[31mhighlighted\x1b[0m word`;

      const result = parseW2vgrepOutput(output);

      expect(result).toHaveLength(1);
      expect(result[0].similarity).toBe(0.8);
      expect(result[0].context[0]).toBe("10: highlighted word");
    });
  });
});

describe("relativePath", () => {
  describe("converts absolute to relative path", () => {
    it("removes base path prefix without trailing slash", () => {
      const result = relativePath("/a/b/c/file.txt", "/a/b");
      expect(result).toBe("c/file.txt");
    });

    it("removes base path prefix with trailing slash", () => {
      const result = relativePath("/a/b/c/file.txt", "/a/b/");
      expect(result).toBe("c/file.txt");
    });

    it("handles deeply nested paths", () => {
      const result = relativePath("/home/user/projects/app/src/utils/helper.ts", "/home/user/projects/app");
      expect(result).toBe("src/utils/helper.ts");
    });

    it("handles single level difference", () => {
      const result = relativePath("/base/file.txt", "/base");
      expect(result).toBe("file.txt");
    });
  });

  describe("handles edge cases", () => {
    it("returns original path if it does not start with base", () => {
      const result = relativePath("/different/path/file.txt", "/a/b");
      expect(result).toBe("/different/path/file.txt");
    });

    it("returns original path if base is longer than path", () => {
      const result = relativePath("/a/b", "/a/b/c/d");
      expect(result).toBe("/a/b");
    });

    it("handles partial prefix match correctly", () => {
      const result = relativePath("/a/bc/file.txt", "/a/b");
      expect(result).toBe("/a/bc/file.txt");
    });

    it("handles identical paths with trailing slash", () => {
      const result = relativePath("/a/b/", "/a/b");
      expect(result).toBe("");
    });

    it("handles identical paths without trailing slash", () => {
      const result = relativePath("/a/b", "/a/b");
      expect(result).toBe("");
    });

    it("handles empty base path", () => {
      const result = relativePath("/some/path/file.txt", "");
      expect(result).toBe("some/path/file.txt");
    });

    it("handles root base path", () => {
      const result = relativePath("/a/b/file.txt", "/");
      expect(result).toBe("a/b/file.txt");
    });
  });

  describe("real-world scenarios", () => {
    it("handles typical project structure", () => {
      const basePath = "/Users/dev/projects/my-app";

      expect(relativePath("/Users/dev/projects/my-app/src/index.ts", basePath))
        .toBe("src/index.ts");

      expect(relativePath("/Users/dev/projects/my-app/tests/unit/test.ts", basePath))
        .toBe("tests/unit/test.ts");

      expect(relativePath("/Users/dev/projects/my-app/package.json", basePath))
        .toBe("package.json");
    });

    it("handles paths with special characters", () => {
      const result = relativePath(
        "/path/to/my project/src/file-name_v2.ts",
        "/path/to/my project"
      );
      expect(result).toBe("src/file-name_v2.ts");
    });

    it("handles paths with dots", () => {
      const result = relativePath("/a/b/.hidden/file.txt", "/a/b");
      expect(result).toBe(".hidden/file.txt");
    });
  });
});

describe("expandTilde", () => {
  const originalHome = process.env.HOME;

  afterEach(() => {
    process.env.HOME = originalHome;
  });

  it("expands ~/path to home directory", () => {
    process.env.HOME = "/home/user";
    expect(expandTilde("~/documents/file.txt")).toBe("/home/user/documents/file.txt");
  });

  it("expands ~ alone to home directory", () => {
    process.env.HOME = "/home/user";
    expect(expandTilde("~")).toBe("/home/user");
  });

  it("returns path unchanged if no tilde", () => {
    expect(expandTilde("/absolute/path/file.txt")).toBe("/absolute/path/file.txt");
  });

  it("returns path unchanged if tilde not at start", () => {
    expect(expandTilde("/path/to/~file.txt")).toBe("/path/to/~file.txt");
  });

  it("handles empty HOME env", () => {
    process.env.HOME = "";
    expect(expandTilde("~/test")).toBe("/test");
  });
});

describe("SearchMatch interface", () => {
  it("creates valid SearchMatch objects", () => {
    const match: SearchMatch = {
      similarity: 0.85,
      line: 42,
      match: "matched content",
      context: ["41: before", "42: matched content", "43: after"],
    };

    expect(match.similarity).toBe(0.85);
    expect(match.line).toBe(42);
    expect(match.match).toBe("matched content");
    expect(match.context).toHaveLength(3);
  });

  it("creates SearchMatch with locations", () => {
    const match: SearchMatch = {
      similarity: 0.85,
      line: 42,
      match: "matched content",
      context: ["41: before", "42: matched content", "43: after"],
      locations: [
        { file: "src/file1.ts", line: 42, context: "before\nmatched content\nafter" },
        { file: "src/file2.ts", line: 15, context: "other before\nmatched content\nother after" },
      ],
    };

    expect(match.locations).toHaveLength(2);
    expect(match.locations![0].file).toBe("src/file1.ts");
    expect(match.locations![0].context).toContain("matched content");
    expect(match.locations![1].line).toBe(15);
  });
});

describe("MatchLocation interface", () => {
  it("creates valid MatchLocation objects", () => {
    const location: MatchLocation = {
      file: "src/utils.ts",
      line: 123,
      context: "line before\nmatched line\nline after",
    };

    expect(location.file).toBe("src/utils.ts");
    expect(location.line).toBe(123);
    expect(location.context).toContain("matched line");
  });
});

describe("escapeForShell", () => {
  it("escapes double quotes", () => {
    expect(escapeForShell('hello "world"')).toBe('hello \\"world\\"');
  });

  it("escapes backslashes", () => {
    expect(escapeForShell("path\\to\\file")).toBe("path\\\\to\\\\file");
  });

  it("escapes dollar signs", () => {
    expect(escapeForShell("$HOME/path")).toBe("\\$HOME/path");
  });

  it("escapes backticks", () => {
    expect(escapeForShell("`command`")).toBe("\\`command\\`");
  });

  it("escapes multiple special characters", () => {
    expect(escapeForShell('$var="value`cmd`"')).toBe('\\$var=\\"value\\`cmd\\`\\"');
  });

  it("returns unchanged string without special chars", () => {
    expect(escapeForShell("hello world")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(escapeForShell("")).toBe("");
  });
});

describe("parseRipgrepOutput", () => {
  it("parses single match without context", () => {
    const output = "/home/user/project/src/file.ts:42:const foo = 'bar';";
    const result = parseRipgrepOutput(output, "/home/user/project");

    expect(result).toHaveLength(1);
    expect(result[0].file).toBe("src/file.ts");
    expect(result[0].line).toBe(42);
    expect(result[0].context).toBe("const foo = 'bar';");
  });

  it("parses match with context lines", () => {
    const output = `/path/file.ts-10-line before
/path/file.ts:11:matched line
/path/file.ts-12-line after`;
    const result = parseRipgrepOutput(output, "/path");

    expect(result).toHaveLength(1);
    expect(result[0].file).toBe("file.ts");
    expect(result[0].line).toBe(11);
    expect(result[0].context).toBe("line before\nmatched line\nline after");
  });

  it("parses multiple blocks separated by --", () => {
    const output = `/path/a.ts-9-before a
/path/a.ts:10:match a
/path/a.ts-11-after a
--
/path/b.ts-19-before b
/path/b.ts:20:match b
/path/b.ts-21-after b`;
    const result = parseRipgrepOutput(output, "/path");

    expect(result).toHaveLength(2);
    expect(result[0].file).toBe("a.ts");
    expect(result[0].line).toBe(10);
    expect(result[0].context).toContain("match a");
    expect(result[1].file).toBe("b.ts");
    expect(result[1].line).toBe(20);
  });

  it("handles content with colons", () => {
    const output = "/path/file.ts:15:const url = 'http://example.com';";
    const result = parseRipgrepOutput(output, "/path");

    expect(result).toHaveLength(1);
    expect(result[0].file).toBe("file.ts");
    expect(result[0].line).toBe(15);
    expect(result[0].context).toBe("const url = 'http://example.com';");
  });

  it("returns empty array for empty output", () => {
    expect(parseRipgrepOutput("", "/path")).toEqual([]);
  });

  it("returns empty array for whitespace-only output", () => {
    expect(parseRipgrepOutput("   \n\n  ", "/path")).toEqual([]);
  });

  it("handles base path with trailing slash", () => {
    const output = "/base/path/src/file.ts:5:content";
    const result = parseRipgrepOutput(output, "/base/path/");

    expect(result[0].file).toBe("src/file.ts");
  });

  it("sorts context lines by line number", () => {
    const output = `/path/file.ts-12-after
/path/file.ts:11:matched
/path/file.ts-10-before`;
    const result = parseRipgrepOutput(output, "/path");

    expect(result[0].context).toBe("before\nmatched\nafter");
  });
});
