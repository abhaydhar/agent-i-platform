import { FilesystemMCP } from './filesystem';
import { codeParserService, type SupportedLanguage } from '../CodeParserService';
import { createLogger } from '../../utils/logger';

const log = createLogger('code-parser-mcp');

/**
 * MCP tools for code parsing and analysis
 */
export const CodeParserMCP = {
  /**
   * Parse code structure to extract tables, columns, functions, and SQL queries
   */
  async parseCodeStructure(args: {
    file_path: string;
    language?: SupportedLanguage;
    extract_types?: Array<'tables' | 'columns' | 'functions' | 'sql_queries' | 'data_flows'>;
    sandboxRoot?: string;
  }): Promise<unknown> {
    try {
      // Read the file
      const fileData = await FilesystemMCP.readFile(
        args.file_path,
        args.sandboxRoot
      );

      if (!fileData.preview) {
        throw new Error('File content is empty');
      }

      // Auto-detect language if not provided
      let language = args.language;
      if (!language) {
        const ext = args.file_path.split('.').pop()?.toLowerCase();
        language = this.detectLanguage(ext || '');
      }

      // Parse the code
      const result = await codeParserService.parseCode(
        fileData.preview,
        args.file_path,
        language
      );

      // Filter by extract_types if specified
      if (args.extract_types && args.extract_types.length > 0) {
        const filtered: any = {
          language: result.language,
          filePath: result.filePath,
          confidence: result.confidence,
          parseTime: result.parseTime,
        };

        if (args.extract_types.includes('tables')) {
          filtered.tables = result.tables;
        }
        if (args.extract_types.includes('columns')) {
          filtered.columns = result.columns;
        }
        if (args.extract_types.includes('functions')) {
          filtered.functions = result.functions;
        }
        if (args.extract_types.includes('sql_queries')) {
          filtered.sqlQueries = result.sqlQueries;
        }
        if (args.extract_types.includes('data_flows')) {
          filtered.dataFlows = result.dataFlows;
        }

        return filtered;
      }

      return result;
    } catch (err) {
      log.error('parse_code_structure error', err);
      throw err;
    }
  },

  /**
   * Trace a specific field across multiple files
   */
  async traceFieldInCode(args: {
    field_name: string;
    file_paths?: string[];
    context_lines?: number;
    semantic_search?: boolean;
    sandboxRoot?: string;
  }): Promise<unknown> {
    try {
      const contextLines = args.context_lines ?? 3;
      const filePaths = args.file_paths ?? [];

      // If no file paths provided, search in sandbox root
      let filesToSearch = filePaths;
      if (filesToSearch.length === 0) {
        const allFiles = await FilesystemMCP.listFiles({
          recursive: true,
          maxFiles: 50,
          sandboxRoot: args.sandboxRoot,
        });
        filesToSearch = allFiles.map(f => f.path);
      }

      // Read all files
      const filesWithContent = await Promise.all(
        filesToSearch.map(async path => {
          try {
            const fileData = await FilesystemMCP.readFile(path, args.sandboxRoot);
            const ext = path.split('.').pop()?.toLowerCase() || '';
            const language = this.detectLanguage(ext);

            return {
              path,
              content: fileData.preview || '',
              language,
            };
          } catch (err) {
            log.warn(`failed to read ${path}:`, err);
            return null;
          }
        })
      );

      const validFiles = filesWithContent.filter(f => f !== null) as Array<{
        path: string;
        content: string;
        language: SupportedLanguage;
      }>;

      // Trace the field
      const result = await codeParserService.traceField(
        args.field_name,
        validFiles,
        contextLines
      );

      return result;
    } catch (err) {
      log.error('trace_field_in_code error', err);
      throw err;
    }
  },

  /**
   * Analyze data flow within a file
   */
  async analyzeDataFlow(args: {
    file_path: string;
    start_variable: string;
    max_hops?: number;
    sandboxRoot?: string;
  }): Promise<unknown> {
    try {
      // Parse the file
      const parseResult = await this.parseCodeStructure({
        file_path: args.file_path,
        extract_types: ['data_flows', 'columns'],
        sandboxRoot: args.sandboxRoot,
      });

      const result = parseResult as any;

      // Build flow chain starting from start_variable
      const flowChain: Array<{
        step: number;
        variable: string;
        lineNumber: number;
        operation: string;
        source?: string;
        transformation?: string;
      }> = [];

      const maxHops = args.max_hops ?? 10;
      let currentVariable = args.start_variable;
      let step = 1;

      // Find all data flows involving the variable
      const relevantFlows = (result.dataFlows || []).filter((flow: any) =>
        flow.from.field === currentVariable || flow.to.field === currentVariable
      );

      for (const flow of relevantFlows) {
        if (step > maxHops) break;

        flowChain.push({
          step: step++,
          variable: flow.to.field,
          lineNumber: flow.lineNumber,
          operation: flow.transformation,
          source: flow.from.source,
          transformation: flow.transformation,
        });

        currentVariable = flow.to.field;
      }

      // Also include column references
      const columnRefs = (result.columns || []).filter((col: any) =>
        col.name === args.start_variable
      );

      return {
        startVariable: args.start_variable,
        flowChain,
        relatedColumns: columnRefs,
        totalHops: flowChain.length,
      };
    } catch (err) {
      log.error('analyze_data_flow error', err);
      throw err;
    }
  },

  /**
   * Batch parse multiple files
   */
  async batchParseFiles(args: {
    file_paths: string[];
    language?: SupportedLanguage;
    sandboxRoot?: string;
  }): Promise<unknown> {
    const results = await Promise.all(
      args.file_paths.map(async path => {
        try {
          return await this.parseCodeStructure({
            file_path: path,
            language: args.language,
            sandboxRoot: args.sandboxRoot,
          });
        } catch (err) {
          log.warn(`failed to parse ${path}:`, err);
          return {
            error: err instanceof Error ? err.message : String(err),
            filePath: path,
          };
        }
      })
    );

    // Aggregate statistics
    const aggregated = {
      totalFiles: results.length,
      successfulParses: results.filter((r: any) => !r.error).length,
      totalTables: new Set<string>(),
      totalColumns: new Set<string>(),
      allResults: results,
    };

    results.forEach((r: any) => {
      if (!r.error) {
        r.tables?.forEach((t: any) => aggregated.totalTables.add(t.name));
        r.columns?.forEach((c: any) => aggregated.totalColumns.add(c.name));
      }
    });

    return {
      ...aggregated,
      totalTables: Array.from(aggregated.totalTables),
      totalColumns: Array.from(aggregated.totalColumns),
    };
  },

  /**
   * Detect language from file extension
   */
  detectLanguage(ext: string): SupportedLanguage {
    const extMap: Record<string, SupportedLanguage> = {
      cs: 'csharp',
      py: 'python',
      sql: 'plsql',
      pls: 'plsql',
      plsql: 'plsql',
      tsql: 'tsql',
      ts: 'typescript',
      tsx: 'typescript',
      js: 'typescript',
      jsx: 'typescript',
    };

    return extMap[ext] || 'typescript';
  },
};
