import { FilesystemMCP } from './mcps/filesystem';
import { Neo4jMCP } from './mcps/neo4j';

export interface ToolDef {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolCallContext {
  sessionId?: string;
}

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export interface ToolHandler {
  def: ToolDef;
  run: (
    args: Record<string, unknown>,
    ctx: ToolCallContext
  ) => Promise<ToolResult>;
}

function ok(data: unknown): ToolResult {
  return { ok: true, data };
}
function fail(error: unknown): ToolResult {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  };
}

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  list_files: {
    def: {
      name: 'list_files',
      description:
        'List code files under the project sandbox. Filters by extension. Use this to discover files relevant to the analysis.',
      input_schema: {
        type: 'object',
        properties: {
          directory: {
            type: 'string',
            description:
              'Directory to scan relative to the sandbox root. Defaults to the sandbox root.',
          },
          extensions: {
            type: 'array',
            items: { type: 'string' },
            description:
              'File extensions (e.g. ["cs", "py", "sql"]). Optional.',
          },
          recursive: { type: 'boolean', default: true },
          maxFiles: { type: 'number', default: 25 },
        },
      },
    },
    async run(args) {
      try {
        const data = await FilesystemMCP.listFiles({
          directory: args.directory as string | undefined,
          extensions: args.extensions as string[] | undefined,
          recursive: args.recursive as boolean | undefined,
          maxFiles: args.maxFiles as number | undefined,
        });
        return ok({ root: FilesystemMCP.rootPath(), files: data });
      } catch (err) {
        return fail(err);
      }
    },
  },

  read_file: {
    def: {
      name: 'read_file',
      description:
        'Read a single text/code file. Returns content (possibly truncated) and total size.',
      input_schema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path relative to the sandbox root (or absolute).',
          },
        },
        required: ['path'],
      },
    },
    async run(args) {
      try {
        const data = await FilesystemMCP.readFile(args.path as string);
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  },

  neo4j_query: {
    def: {
      name: 'neo4j_query',
      description:
        'Run a Cypher read-query against the configured Neo4j instance. Returns up to 50 records. Use only when the user requested graph enrichment.',
      input_schema: {
        type: 'object',
        properties: {
          cypher: {
            type: 'string',
            description: 'A Cypher MATCH/RETURN query (read-only).',
          },
          params: {
            type: 'object',
            description: 'Parameter map for the query.',
          },
        },
        required: ['cypher'],
      },
    },
    async run(args) {
      try {
        if (!(await Neo4jMCP.isConfigured())) {
          return fail('Neo4j is not configured');
        }
        const data = await Neo4jMCP.runCypher(
          args.cypher as string,
          (args.params as Record<string, unknown>) ?? {}
        );
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  },

  find_field_lineage: {
    def: {
      name: 'find_field_lineage',
      description:
        'Look up an existing field/column in the Neo4j knowledge graph and return related snippets and DB calls.',
      input_schema: {
        type: 'object',
        properties: {
          field_name: { type: 'string' },
          run_id: { type: 'string' },
        },
        required: ['field_name'],
      },
    },
    async run(args) {
      try {
        if (!(await Neo4jMCP.isConfigured())) {
          return fail('Neo4j is not configured');
        }
        const data = await Neo4jMCP.findFieldLineage({
          fieldName: args.field_name as string,
          runId: args.run_id as string | undefined,
        });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  },
};

export const MCPManager = {
  toolsForSkills(skills: string[]): ToolHandler[] {
    const out: ToolHandler[] = [];
    const wantsFs =
      skills.includes('data-lineage') ||
      skills.includes('code-analysis') ||
      skills.includes('filesystem');
    const wantsNeo =
      skills.includes('data-lineage') || skills.includes('neo4j');

    if (wantsFs) {
      out.push(TOOL_HANDLERS.list_files, TOOL_HANDLERS.read_file);
    }
    if (wantsNeo) {
      out.push(TOOL_HANDLERS.neo4j_query, TOOL_HANDLERS.find_field_lineage);
    }
    return out;
  },

  async runTool(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolCallContext
  ): Promise<ToolResult> {
    const handler = TOOL_HANDLERS[name];
    if (!handler) return fail(`Unknown tool '${name}'`);
    return handler.run(args, ctx);
  },
};
