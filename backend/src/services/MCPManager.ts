import { env } from '../config/env';
import { FilesystemMCP } from './mcps/filesystem';
import { Neo4jMCP } from './mcps/neo4j';
import { Neo4jMCPEnhanced } from './mcps/neo4j-enhanced';
import { CodeParserMCP } from './mcps/code-parser';
import { Neo4jComprehensiveMCP } from './mcps/neo4j-comprehensive';

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
  /** Resolved repository root for filesystem tools for this agent run. */
  fsSandboxRoot?: string;
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
const toolCache = new Map<string, { result: ToolResult; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCacheKey(name: string, args: Record<string, unknown>, sessionId?: string): string {
  const cacheable = [
    'read_file',
    'list_files',
    'neo4j_find_field_lineage',
    'neo4j_get_stats',
    'neo4j_list_execution_flows',
    'neo4j_get_entity_usage_spread',
    'neo4j_search_snippets',
  ];
  if (!cacheable.includes(name)) return '';
  return `${sessionId}:${name}:${JSON.stringify(args)}`;
}
export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  list_files: {
    def: {
      name: 'list_files',
      description:
        'List code files under the repository root for this run (see run trace or server FS_SANDBOX_ROOT). Filters by extension.',
      input_schema: {
        type: 'object',
        properties: {
          directory: {
            type: 'string',
            description:
              'Directory to scan relative to the run repository root. Omit to use the repository root.',
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
    async run(args, ctx) {
      try {
        const data = await FilesystemMCP.listFiles({
          directory: args.directory as string | undefined,
          extensions: args.extensions as string[] | undefined,
          recursive: args.recursive as boolean | undefined,
          maxFiles: args.maxFiles as number | undefined,
          sandboxRoot: ctx.fsSandboxRoot,
        });
        return ok({ root: FilesystemMCP.rootPath(ctx.fsSandboxRoot), files: data });
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
            description:
              'Path relative to the run repository root, or absolute if it stays inside that root.',
          },
        },
        required: ['path'],
      },
    },
    async run(args, ctx) {
      try {
        const data = await FilesystemMCP.readFile(
          args.path as string,
          ctx.fsSandboxRoot
        );
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
  neo4j_get_stats: {
    def: {
      name: 'neo4j_get_stats',
      description:
        'Get database statistics and available run_ids. Use this FIRST to understand what data is available in the Neo4j knowledge graph. Returns node counts by label and list of available run_ids.',
      input_schema: {
        type: 'object',
        properties: {
          run_id: {
            type: 'number',
            description: 'Optional: Get stats for specific run_id',
          },
        },
      },
    },
    async run(args) {
      try {
        if (!(await Neo4jMCP.isConfigured())) {
          return fail('Neo4j is not configured');
        }
        const stats = await Neo4jComprehensiveMCP.getStats(
          args.run_id as number | undefined
        );
        return ok(stats);
      } catch (err) {
        return fail(err);
      }
    },
  },

  neo4j_find_field_lineage: {
    def: {
      name: 'neo4j_find_field_lineage',
      description:
        'Find comprehensive field lineage from Neo4j knowledge graph: DatabaseEntity → Dbcall → Snippet → ExecutionFlow. Shows which code touches the field, operations, and execution context. This is the PRIMARY tool for field lineage - always use this instead of the legacy find_field_lineage.',
      input_schema: {
        type: 'object',
        properties: {
          field_name: {
            type: 'string',
            description: 'Database field/column name to trace',
          },
          run_id: {
            type: 'number',
            description: 'Version/parse run identifier (required - get from neo4j_get_stats)',
          },
          operation_type: {
            type: 'string',
            description: 'Optional: Filter by operation (SELECT, INSERT, UPDATE, DELETE)',
          },
          limit: {
            type: 'number',
            default: 100,
            description: 'Max results (default 100)',
          },
        },
        required: ['field_name', 'run_id'],
      },
    },
    async run(args) {
      try {
        if (!(await Neo4jMCP.isConfigured())) {
          return fail('Neo4j is not configured');
        }
        const lineage = await Neo4jComprehensiveMCP.findFieldLineage(
          args.field_name as string,
          args.run_id as number,
          args.operation_type as string | undefined,
          args.limit as number | undefined
        );
        return ok(lineage);
      } catch (err) {
        return fail(err);
      }
    },
  },

  neo4j_get_variable_lineage: {
    def: {
      name: 'neo4j_get_variable_lineage',
      description:
        'Trace variable lineage through the codebase. Returns transformation chain showing which snippets use the variable, their call relationships, and transformations. Essential for understanding data flow within code.',
      input_schema: {
        type: 'object',
        properties: {
          variable_term: {
            type: 'string',
            description: 'Variable term to trace',
          },
          run_id: {
            type: 'number',
            description: 'Version/parse run identifier',
          },
          direction: {
            type: 'string',
            enum: ['forward', 'backward', 'both'],
            default: 'both',
            description: 'Lineage direction: forward (downstream), backward (upstream), or both',
          },
          limit: {
            type: 'number',
            default: 100,
            description: 'Max results',
          },
        },
        required: ['variable_term', 'run_id'],
      },
    },
    async run(args) {
      try {
        if (!(await Neo4jMCP.isConfigured())) {
          return fail('Neo4j is not configured');
        }
        const lineage = await Neo4jComprehensiveMCP.getVariableLineage(
          args.variable_term as string,
          args.run_id as number,
          (args.direction as 'forward' | 'backward' | 'both') || 'both',
          args.limit as number | undefined
        );
        return ok(lineage);
      } catch (err) {
        return fail(err);
      }
    },
  },

  neo4j_trace_call_chain: {
    def: {
      name: 'neo4j_trace_call_chain',
      description:
        'Trace call relationships from a snippet (function/method). Returns call chains up to max_depth. Use for understanding function dependencies and call hierarchies.',
      input_schema: {
        type: 'object',
        properties: {
          snippet_key: {
            type: 'string',
            description: 'Snippet key to trace from',
          },
          run_id: {
            type: 'number',
            description: 'Version/parse run identifier',
          },
          max_depth: {
            type: 'number',
            default: 5,
            description: 'Maximum traversal depth (1-10)',
          },
          direction: {
            type: 'string',
            enum: ['outgoing', 'incoming', 'both'],
            default: 'outgoing',
            description: 'outgoing = what this calls, incoming = what calls this, both = complete picture',
          },
          limit: {
            type: 'number',
            default: 200,
            description: 'Max results',
          },
        },
        required: ['snippet_key', 'run_id'],
      },
    },
    async run(args) {
      try {
        if (!(await Neo4jMCP.isConfigured())) {
          return fail('Neo4j is not configured');
        }
        const chains = await Neo4jComprehensiveMCP.traceCallChain(
          args.snippet_key as string,
          args.run_id as number,
          args.max_depth as number | undefined,
          (args.direction as 'outgoing' | 'incoming' | 'both') || 'outgoing',
          args.limit as number | undefined
        );
        return ok(chains);
      } catch (err) {
        return fail(err);
      }
    },
  },

  neo4j_get_db_calls: {
    def: {
      name: 'neo4j_get_db_calls',
      description:
        'Get all database operations inside a snippet (function/procedure). Returns operation_type (SELECT/INSERT/UPDATE/DELETE), entity names, and queries. Essential for understanding data access patterns.',
      input_schema: {
        type: 'object',
        properties: {
          snippet_key: {
            type: 'string',
            description: 'Snippet key',
          },
          run_id: {
            type: 'number',
            description: 'Version/parse run identifier',
          },
        },
        required: ['snippet_key', 'run_id'],
      },
    },
    async run(args) {
      try {
        if (!(await Neo4jMCP.isConfigured())) {
          return fail('Neo4j is not configured');
        }
        const dbCalls = await Neo4jComprehensiveMCP.getDbCalls(
          args.snippet_key as string,
          args.run_id as number
        );
        return ok(dbCalls);
      } catch (err) {
        return fail(err);
      }
    },
  },

  neo4j_search_snippets: {
    def: {
      name: 'neo4j_search_snippets',
      description:
        'Search for code snippets by file path pattern or name. Returns matched snippets with their execution flow context. Use for discovering relevant code locations.',
      input_schema: {
        type: 'object',
        properties: {
          run_id: {
            type: 'number',
            description: 'Version/parse run identifier',
          },
          file_path_pattern: {
            type: 'string',
            description: 'File path pattern (e.g., "payment", "controller")',
          },
          name_pattern: {
            type: 'string',
            description: 'Snippet name pattern (e.g., "Process", "Calculate")',
          },
          snippet_type: {
            type: 'string',
            enum: ['ROOT', 'REGULAR'],
            description: 'Filter by snippet type (ROOT = entry points)',
          },
          limit: {
            type: 'number',
            default: 100,
            description: 'Max results',
          },
        },
        required: ['run_id'],
      },
    },
    async run(args) {
      try {
        if (!(await Neo4jMCP.isConfigured())) {
          return fail('Neo4j is not configured');
        }
        const snippets = await Neo4jComprehensiveMCP.searchSnippets(
          args.run_id as number,
          args.file_path_pattern as string | undefined,
          args.name_pattern as string | undefined,
          args.snippet_type as 'ROOT' | 'REGULAR' | undefined,
          args.limit as number | undefined
        );
        return ok(snippets);
      } catch (err) {
        return fail(err);
      }
    },
  },

  neo4j_get_snippet_location: {
    def: {
      name: 'neo4j_get_snippet_location',
      description:
        'Get location metadata for a snippet (function/procedure). Returns snippet_key, snippet_name, file_name, file_path, line numbers. Use this to locate snippets, then use read_file or parse_code_structure for actual code.',
      input_schema: {
        type: 'object',
        properties: {
          snippet_key: {
            type: 'string',
            description: 'Snippet key',
          },
          run_id: {
            type: 'number',
            description: 'Version/parse run identifier',
          },
        },
        required: ['snippet_key', 'run_id'],
      },
    },
    async run(args) {
      try {
        if (!(await Neo4jMCP.isConfigured())) {
          return fail('Neo4j is not configured');
        }
        const location = await Neo4jComprehensiveMCP.getSnippetLocation(
          args.snippet_key as string,
          args.run_id as number
        );
        return ok(location);
      } catch (err) {
        return fail(err);
      }
    },
  },

  neo4j_list_execution_flows: {
    def: {
      name: 'neo4j_list_execution_flows',
      description:
        'List all execution flows for a run_id. Returns each flow with key, name, entry point, and snippet count. Use this early to discover available flows before diving deeper into specific lineage.',
      input_schema: {
        type: 'object',
        properties: {
          run_id: {
            type: 'number',
            description: 'Version/parse run identifier',
          },
          limit: {
            type: 'number',
            default: 100,
            description: 'Max flows to return',
          },
        },
        required: ['run_id'],
      },
    },
    async run(args) {
      try {
        if (!(await Neo4jMCP.isConfigured())) {
          return fail('Neo4j is not configured');
        }
        const flows = await Neo4jComprehensiveMCP.listExecutionFlows(
          args.run_id as number,
          args.limit as number | undefined
        );
        return ok(flows);
      } catch (err) {
        return fail(err);
      }
    },
  },

  neo4j_get_execution_flow_subgraph: {
    def: {
      name: 'neo4j_get_execution_flow_subgraph',
      description:
        'Get a bounded subgraph for an execution flow. Returns all snippets in the flow, their call relationships (bounded by depth), and database operations. Use to understand a complete flow without overloading context.',
      input_schema: {
        type: 'object',
        properties: {
          flow_key: {
            type: 'string',
            description: 'ExecutionFlow key',
          },
          run_id: {
            type: 'number',
            description: 'Version/parse run identifier',
          },
          max_depth: {
            type: 'number',
            default: 3,
            description: 'Maximum call chain depth (1-10)',
          },
          limit: {
            type: 'number',
            default: 200,
            description: 'Max results',
          },
        },
        required: ['flow_key', 'run_id'],
      },
    },
    async run(args) {
      try {
        if (!(await Neo4jMCP.isConfigured())) {
          return fail('Neo4j is not configured');
        }
        const subgraph = await Neo4jComprehensiveMCP.getExecutionFlowSubgraph(
          args.flow_key as string,
          args.run_id as number,
          args.max_depth as number | undefined,
          args.limit as number | undefined
        );
        return ok(subgraph);
      } catch (err) {
        return fail(err);
      }
    },
  },

  neo4j_get_entity_usage_spread: {
    def: {
      name: 'neo4j_get_entity_usage_spread',
      description:
        'Get how many snippets and dbcalls touch each DatabaseEntity. Returns snippet_count and dbcall_count per entity. Use for understanding which tables/entities are most heavily used and potential impact analysis.',
      input_schema: {
        type: 'object',
        properties: {
          run_id: {
            type: 'number',
            description: 'Version/parse run identifier',
          },
          min_snippets: {
            type: 'number',
            default: 0,
            description: 'Min snippet count to include',
          },
          limit: {
            type: 'number',
            default: 50,
            description: 'Max entities to return',
          },
        },
        required: ['run_id'],
      },
    },
    async run(args) {
      try {
        if (!(await Neo4jMCP.isConfigured())) {
          return fail('Neo4j is not configured');
        }
        const usage = await Neo4jComprehensiveMCP.getEntityUsageSpread(
          args.run_id as number,
          args.min_snippets as number | undefined,
          args.limit as number | undefined
        );
        return ok(usage);
      } catch (err) {
        return fail(err);
      }
    },
  },

  parse_code_structure: {
    def: {
      name: 'parse_code_structure',
      description:
        'Parse a code file to extract structured data including tables, columns, functions, SQL queries, and data flows. Supports C#, Python, PL/SQL, T-SQL, and TypeScript.',
      input_schema: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Path to the code file to parse',
          },
          language: {
            type: 'string',
            enum: ['csharp', 'python', 'plsql', 'tsql', 'typescript'],
            description: 'Programming language (auto-detected if not provided)',
          },
          extract_types: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['tables', 'columns', 'functions', 'sql_queries', 'data_flows'],
            },
            description: 'Specific types to extract (extracts all if not specified)',
          },
        },
        required: ['file_path'],
      },
    },
    async run(args, ctx) {
      try {
        const data = await CodeParserMCP.parseCodeStructure({
          file_path: args.file_path as string,
          language: args.language as any,
          extract_types: args.extract_types as any,
          sandboxRoot: ctx.fsSandboxRoot,
        });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  },

  trace_field_in_code: {
    def: {
      name: 'trace_field_in_code',
      description:
        'Find all occurrences of a specific field/column across multiple code files with surrounding context. Returns file paths, line numbers, usage types, and code snippets.',
      input_schema: {
        type: 'object',
        properties: {
          field_name: {
            type: 'string',
            description: 'The field/column name to search for',
          },
          file_paths: {
            type: 'array',
            items: { type: 'string' },
            description:
              'List of file paths to search. If empty, searches all files under the repository root.',
          },
          context_lines: {
            type: 'number',
            default: 3,
            description: 'Number of lines to include before and after each match',
          },
          semantic_search: {
            type: 'boolean',
            default: true,
            description: 'Enable semantic understanding of field usage',
          },
        },
        required: ['field_name'],
      },
    },
    async run(args, ctx) {
      try {
        const data = await CodeParserMCP.traceFieldInCode({
          field_name: args.field_name as string,
          file_paths: args.file_paths as string[] | undefined,
          context_lines: args.context_lines as number | undefined,
          semantic_search: args.semantic_search as boolean | undefined,
          sandboxRoot: ctx.fsSandboxRoot,
        });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  },

  analyze_data_flow: {
    def: {
      name: 'analyze_data_flow',
      description:
        'Analyze how a variable/field flows through code within a single file. Traces assignments, transformations, and references.',
      input_schema: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Path to the code file',
          },
          start_variable: {
            type: 'string',
            description: 'The variable/field name to start tracing from',
          },
          max_hops: {
            type: 'number',
            default: 10,
            description: 'Maximum number of transformation steps to follow',
          },
        },
        required: ['file_path', 'start_variable'],
      },
    },
    async run(args, ctx) {
      try {
        const data = await CodeParserMCP.analyzeDataFlow({
          file_path: args.file_path as string,
          start_variable: args.start_variable as string,
          max_hops: args.max_hops as number | undefined,
          sandboxRoot: ctx.fsSandboxRoot,
        });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  },

  batch_parse_files: {
    def: {
      name: 'batch_parse_files',
      description:
        'Parse multiple code files at once and return aggregated statistics about tables, columns, and queries found.',
      input_schema: {
        type: 'object',
        properties: {
          file_paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of file paths to parse',
          },
          language: {
            type: 'string',
            enum: ['csharp', 'python', 'plsql', 'tsql', 'typescript'],
            description: 'Language (auto-detected per file if not provided)',
          },
        },
        required: ['file_paths'],
      },
    },
    async run(args, ctx) {
      try {
        const data = await CodeParserMCP.batchParseFiles({
          file_paths: args.file_paths as string[],
          language: args.language as any,
          sandboxRoot: ctx.fsSandboxRoot,
        });
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  },

  neo4j_introspect: {
    def: {
      name: 'neo4j_introspect',
      description:
        'Discover the Neo4j graph schema including node labels, relationship types, property keys, constraints, and indexes. Use this before running queries to understand the graph structure.',
      input_schema: {
        type: 'object',
        properties: {
          sample_size: {
            type: 'number',
            default: 100,
            description: 'Number of nodes to sample for property discovery',
          },
        },
      },
    },
    async run(args) {
      try {
        if (!(await Neo4jMCP.isConfigured())) {
          return fail('Neo4j is not configured');
        }
        const schema = await Neo4jMCPEnhanced.introspectSchema(
          args.sample_size as number | undefined
        );
        return ok(schema);
      } catch (err) {
        return fail(err);
      }
    },
  },

  neo4j_build_lineage_query: {
    def: {
      name: 'neo4j_build_lineage_query',
      description:
        'Generate an optimized Cypher query for tracing field lineage based on the discovered graph schema. Returns a Cypher query string that can be executed with neo4j_query.',
      input_schema: {
        type: 'object',
        properties: {
          field_name: {
            type: 'string',
            description: 'The field/column name to trace',
          },
          direction: {
            type: 'string',
            enum: ['upstream', 'downstream', 'both'],
            default: 'both',
            description:
              'upstream = find sources, downstream = find consumers, both = complete lineage',
          },
          max_depth: {
            type: 'number',
            default: 3,
            description: 'Maximum relationship hops to traverse',
          },
          include_code: {
            type: 'boolean',
            default: true,
            description: 'Include code snippets in results',
          },
          schema: {
            type: 'object',
            description:
              'Graph schema from neo4j_introspect (required for optimal queries)',
          },
        },
        required: ['field_name', 'schema'],
      },
    },
    async run(args) {
      try {
        if (!(await Neo4jMCP.isConfigured())) {
          return fail('Neo4j is not configured');
        }
        const query = Neo4jMCPEnhanced.buildLineageQuery(
          {
            fieldName: args.field_name as string,
            direction: (args.direction as 'upstream' | 'downstream' | 'both') || 'both',
            maxDepth: (args.max_depth as number) || 3,
            includeCode: (args.include_code as boolean) ?? true,
          },
          args.schema as any
        );
        return ok({ cypherQuery: query, fieldName: args.field_name });
      } catch (err) {
        return fail(err);
      }
    },
  },

  neo4j_validate_entity: {
    def: {
      name: 'neo4j_validate_entity',
      description:
        'Validate a Neo4j node against actual source code. Compares the code snippet and file location stored in the graph with the actual file content to detect outdated or incorrect data.',
      input_schema: {
        type: 'object',
        properties: {
          node_id: {
            type: 'string',
            description: 'Neo4j node ID to validate',
          },
          file_path: {
            type: 'string',
            description: 'Optional: Override file path to check against',
          },
          line_number: {
            type: 'number',
            description: 'Optional: Override line number to check',
          },
        },
        required: ['node_id'],
      },
    },
    async run(args, ctx) {
      try {
        if (!(await Neo4jMCP.isConfigured())) {
          return fail('Neo4j is not configured');
        }
        const validation = await Neo4jMCPEnhanced.validateNode({
          nodeId: args.node_id as string,
          filePath: args.file_path as string | undefined,
          lineNumber: args.line_number as number | undefined,
          fsSandboxRoot: ctx.fsSandboxRoot,
        });
        return ok(validation);
      } catch (err) {
        return fail(err);
      }
    },
  },

  neo4j_batch_field_lineage: {
    def: {
      name: 'neo4j_batch_field_lineage',
      description:
        'Query lineage for multiple fields at once for better performance. Returns a map of field names to their lineage data.',
      input_schema: {
        type: 'object',
        properties: {
          field_names: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of field/column names to query',
          },
          schema: {
            type: 'object',
            description: 'Optional: Graph schema for optimized queries',
          },
        },
        required: ['field_names'],
      },
    },
    async run(args) {
      try {
        if (!(await Neo4jMCP.isConfigured())) {
          return fail('Neo4j is not configured');
        }
        const results = await Neo4jMCPEnhanced.batchFieldLineage(
          args.field_names as string[],
          args.schema as any
        );

        // Convert Map to object for JSON serialization
        const resultObj: Record<string, any> = {};
        results.forEach((value, key) => {
          resultObj[key] = value;
        });

        return ok(resultObj);
      } catch (err) {
        return fail(err);
      }
    },
  },

  neo4j_find_similar_fields: {
    def: {
      name: 'neo4j_find_similar_fields',
      description:
        'Find fields with similar names in the graph using fuzzy matching. Useful when the exact field name is unknown or may have variations.',
      input_schema: {
        type: 'object',
        properties: {
          field_name: {
            type: 'string',
            description: 'Field name to search for (partial matches allowed)',
          },
          threshold: {
            type: 'number',
            default: 0.7,
            description: 'Similarity threshold (0.0 to 1.0)',
          },
        },
        required: ['field_name'],
      },
    },
    async run(args) {
      try {
        if (!(await Neo4jMCP.isConfigured())) {
          return fail('Neo4j is not configured');
        }
        const matches = await Neo4jMCPEnhanced.findSimilarFields(
          args.field_name as string,
          args.threshold as number | undefined
        );
        return ok({ matches, totalFound: matches.length });
      } catch (err) {
        return fail(err);
      }
    },
  },
};

export interface ToolsForSkillsOptions {
  /**
   * When false, omit AST/code-parser tools even if the agent has the `code-ast-parse` skill.
   * Driven by ENABLE_CODE_PARSER_TOOLS.
   */
  includeCodeParserTools?: boolean;
}

function wantsAstParserTools(skills: string[]): boolean {
  return skills.includes('code-ast-parse');
}

export const MCPManager = {
  toolsForSkills(skills: string[], options?: ToolsForSkillsOptions): ToolHandler[] {
    const out: ToolHandler[] = [];
    const wantsFs =
      skills.includes('data-lineage') ||
      skills.includes('code-analysis') ||
      skills.includes('filesystem');
    const wantsNeo =
      skills.includes('data-lineage') || skills.includes('neo4j');
    const wantsCodeParsing =
      wantsAstParserTools(skills) &&
      (options?.includeCodeParserTools !== false);

    if (wantsFs && env.useMcpFilesystemTools) {
      out.push(TOOL_HANDLERS.list_files, TOOL_HANDLERS.read_file);
    }
    if (wantsNeo) {
      // Basic Neo4j tools
      // out.push(
      //   TOOL_HANDLERS.neo4j_query,
      //   TOOL_HANDLERS.find_field_lineage
      // );
      // Comprehensive Neo4j tools (PRIMARY for data lineage)
      out.push(
        TOOL_HANDLERS.neo4j_get_stats,
        TOOL_HANDLERS.neo4j_find_field_lineage,
        TOOL_HANDLERS.neo4j_get_variable_lineage,
        TOOL_HANDLERS.neo4j_trace_call_chain,
        TOOL_HANDLERS.neo4j_get_db_calls,
        TOOL_HANDLERS.neo4j_search_snippets,
        TOOL_HANDLERS.neo4j_get_snippet_location,
        TOOL_HANDLERS.neo4j_list_execution_flows,
        TOOL_HANDLERS.neo4j_get_execution_flow_subgraph,
        TOOL_HANDLERS.neo4j_get_entity_usage_spread
      );
      // Enhanced Neo4j tools
      // out.push(
      //   TOOL_HANDLERS.neo4j_introspect,
      //   TOOL_HANDLERS.neo4j_build_lineage_query,
      //   TOOL_HANDLERS.neo4j_validate_entity,
      //   TOOL_HANDLERS.neo4j_batch_field_lineage,
      //   TOOL_HANDLERS.neo4j_find_similar_fields
      // );
    }
    if (wantsCodeParsing) {
      out.push(
        TOOL_HANDLERS.parse_code_structure,
        TOOL_HANDLERS.trace_field_in_code,
        TOOL_HANDLERS.analyze_data_flow,
        TOOL_HANDLERS.batch_parse_files
      );
    }
    return out;
  },

  async runTool(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolCallContext
  ): Promise<ToolResult> {
    // Check cache
    const cacheKey = getCacheKey(name, args, ctx.sessionId);
    if (cacheKey) {
      const cached = toolCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.result;
      }
    }

    const handler = TOOL_HANDLERS[name];
    if (!handler) return fail(`Unknown tool '${name}'`);

    const result = await handler.run(args, ctx);

    // Cache successful results
    if (cacheKey && result.ok) {
      toolCache.set(cacheKey, { result, timestamp: Date.now() });
    }

    return result;
  },
};
