import nodeSqlParser from 'node-sql-parser';
import { createLogger } from '../utils/logger';

const log = createLogger('code-parser');

export type SupportedLanguage = 'csharp' | 'python' | 'plsql' | 'tsql' | 'typescript';
export type AccessType = 'READ' | 'WRITE' | 'JOIN' | 'UPDATE' | 'DELETE' | 'INSERT';
export type UsageType = 'select' | 'insert' | 'update' | 'delete' | 'join' | 'where' | 'assignment';

export interface TableReference {
  name: string;
  lineNumber: number;
  accessType: AccessType;
  alias?: string;
  schema?: string;
}

export interface ColumnReference {
  name: string;
  table?: string;
  lineNumber: number;
  context: UsageType;
  snippet: string;
  confidence: number;
}

export interface FunctionReference {
  name: string;
  lineNumber: number;
  parameters: string[];
  returnType?: string;
  containsTables?: string[];
}

export interface SqlQuery {
  lineNumber: number;
  queryText: string;
  queryType: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'MERGE';
  tables: string[];
  columns: string[];
  confidence: number;
}

export interface DataFlow {
  from: { field: string; source: string };
  to: { field: string; source: string };
  transformation: string;
  lineNumber: number;
  confidence: number;
}

export interface ParseResult {
  language: SupportedLanguage;
  filePath: string;
  tables: TableReference[];
  columns: ColumnReference[];
  functions: FunctionReference[];
  sqlQueries: SqlQuery[];
  dataFlows: DataFlow[];
  confidence: number;
  parseTime: number;
}

export interface FieldOccurrence {
  file: string;
  lineNumber: number;
  usage: UsageType;
  context: {
    before: string;
    line: string;
    after: string;
  };
  confidence: number;
  pattern: string;
}

export interface FieldTraceResult {
  field: string;
  totalOccurrences: number;
  occurrences: FieldOccurrence[];
}

export class CodeParserService {
  private sqlParser: InstanceType<typeof nodeSqlParser.Parser>;

  constructor() {
    this.sqlParser = new nodeSqlParser.Parser();
  }

  /**
   * Parse code file and extract structured data
   */
  async parseCode(
    code: string,
    filePath: string,
    language: SupportedLanguage
  ): Promise<ParseResult> {
    const startTime = Date.now();

    let result: ParseResult;

    try {
      switch (language) {
        case 'csharp':
          result = await this.parseCSharp(code, filePath);
          break;
        case 'python':
          result = await this.parsePython(code, filePath);
          break;
        case 'plsql':
          result = await this.parseSQL(code, filePath, 'plsql');
          break;
        case 'tsql':
          result = await this.parseSQL(code, filePath, 'tsql');
          break;
        case 'typescript':
          result = await this.parseTypeScript(code, filePath);
          break;
        default:
          throw new Error(`Unsupported language: ${language}`);
      }

      result.parseTime = Date.now() - startTime;
      log.info(`parsed ${filePath} (${language}) in ${result.parseTime}ms`);

      return result;
    } catch (err) {
      log.error(`parse error in ${filePath}`, err);
      throw err;
    }
  }

  /**
   * Parse C# code using regex patterns
   */
  private async parseCSharp(code: string, filePath: string): Promise<ParseResult> {
    const lines = code.split('\n');
    const tables: TableReference[] = [];
    const columns: ColumnReference[] = [];
    const sqlQueries: SqlQuery[] = [];
    const functions: FunctionReference[] = [];
    const dataFlows: DataFlow[] = [];

    // Pattern for LINQ queries: .Select(x => x.field)
    const linqSelectPattern = /\.Select\s*\(\s*\w+\s*=>\s*(\w+)\.(\w+)\s*\)/gi;

    // Pattern for LINQ Where: .Where(x => x.field == value)
    const linqWherePattern = /\.Where\s*\(\s*\w+\s*=>\s*(\w+)\.(\w+)\s*[=!<>]+/gi;

    // Pattern for DbContext tables: db.TableName or context.TableName
    const dbContextPattern = /(?:db|context|_context)\.(\w+)/gi;

    // Pattern for SQL strings
    const sqlStringPattern = /@?"(SELECT|INSERT|UPDATE|DELETE|MERGE)\s+.*?"/gis;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Find DbContext table references
      let match;
      const tableMatches = new Set<string>();

      while ((match = dbContextPattern.exec(line)) !== null) {
        const tableName = match[1];
        if (!tableMatches.has(tableName) && this.isLikelyTableName(tableName)) {
          tableMatches.add(tableName);

          // Determine access type
          let accessType: AccessType = 'READ';
          if (line.includes('.Add(') || line.includes('.AddAsync(')) {
            accessType = 'INSERT';
          } else if (line.includes('.Update(')) {
            accessType = 'UPDATE';
          } else if (line.includes('.Remove(') || line.includes('.RemoveAsync(')) {
            accessType = 'DELETE';
          }

          tables.push({
            name: tableName,
            lineNumber,
            accessType,
          });
        }
      }

      // Find LINQ Select columns
      while ((match = linqSelectPattern.exec(line)) !== null) {
        const tableName = match[1];
        const columnName = match[2];

        columns.push({
          name: columnName,
          table: tableName,
          lineNumber,
          context: 'select',
          snippet: line.trim(),
          confidence: 0.9,
        });
      }

      // Find LINQ Where columns
      while ((match = linqWherePattern.exec(line)) !== null) {
        const tableName = match[1];
        const columnName = match[2];

        columns.push({
          name: columnName,
          table: tableName,
          lineNumber,
          context: 'where',
          snippet: line.trim(),
          confidence: 0.9,
        });
      }

      // Find SQL query strings
      while ((match = sqlStringPattern.exec(line)) !== null) {
        const queryText = match[0].replace(/^@?"/, '').replace(/"$/, '');
        const queryType = match[1].toUpperCase() as SqlQuery['queryType'];

        try {
          const parsed = this.parseEmbeddedSQL(queryText, 'mssql');
          sqlQueries.push({
            lineNumber,
            queryText: queryText.substring(0, 200), // Truncate for display
            queryType,
            tables: parsed.tables,
            columns: parsed.columns,
            confidence: 0.85,
          });
        } catch (err) {
          // If SQL parsing fails, still record basic info
          sqlQueries.push({
            lineNumber,
            queryText: queryText.substring(0, 200),
            queryType,
            tables: [],
            columns: [],
            confidence: 0.5,
          });
        }
      }

      // Detect property mapping (data flows)
      const mappingPattern = /(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/g;
      while ((match = mappingPattern.exec(line)) !== null) {
        const toObject = match[1];
        const toField = match[2];
        const fromObject = match[3];
        const fromField = match[4];

        dataFlows.push({
          from: { field: fromField, source: fromObject },
          to: { field: toField, source: toObject },
          transformation: 'mapping',
          lineNumber,
          confidence: 0.85,
        });
      }

      // Find method definitions
      const methodPattern = /(?:public|private|protected|internal)\s+(?:async\s+)?(?:Task<)?(\w+)>?\s+(\w+)\s*\(/;
      const methodMatch = line.match(methodPattern);
      if (methodMatch) {
        functions.push({
          name: methodMatch[2],
          lineNumber,
          parameters: [],
          returnType: methodMatch[1],
        });
      }
    }

    return {
      language: 'csharp',
      filePath,
      tables,
      columns,
      functions,
      sqlQueries,
      dataFlows,
      confidence: this.calculateOverallConfidence(tables.length, columns.length, sqlQueries.length),
      parseTime: 0, // Set by caller
    };
  }

  /**
   * Parse Python code using regex patterns
   */
  private async parsePython(code: string, filePath: string): Promise<ParseResult> {
    const lines = code.split('\n');
    const tables: TableReference[] = [];
    const columns: ColumnReference[] = [];
    const sqlQueries: SqlQuery[] = [];
    const functions: FunctionReference[] = [];
    const dataFlows: DataFlow[] = [];

    // Pattern for pandas DataFrame operations
    const dfPattern = /df\[['"](\w+)['"]\]/g;

    // Pattern for SQL queries in strings
    const sqlPattern = /(?:"""|\"\"\"|'''|'|")(SELECT|INSERT|UPDATE|DELETE)[\s\S]*?(?:"""|'''|'|")/gi;

    // Pattern for SQLAlchemy: Model.query.filter_by(field=value)
    const sqlAlchemyPattern = /(\w+)\.query\.filter_by\s*\(\s*(\w+)\s*=/g;

    // Pattern for function definitions
    const funcPattern = /def\s+(\w+)\s*\(([^)]*)\)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Find DataFrame column references
      let match;
      while ((match = dfPattern.exec(line)) !== null) {
        const columnName = match[1];

        columns.push({
          name: columnName,
          lineNumber,
          context: 'select',
          snippet: line.trim(),
          confidence: 0.85,
        });
      }

      // Find SQL query strings
      while ((match = sqlPattern.exec(line)) !== null) {
        const queryText = match[0].replace(/^(?:"""|'''|'|")/, '').replace(/(?:"""|'''|'|")$/, '');
        const queryType = match[1].toUpperCase() as SqlQuery['queryType'];

        try {
          const parsed = this.parseEmbeddedSQL(queryText, 'postgresql');
          sqlQueries.push({
            lineNumber,
            queryText: queryText.substring(0, 200),
            queryType,
            tables: parsed.tables,
            columns: parsed.columns,
            confidence: 0.85,
          });
        } catch (err) {
          sqlQueries.push({
            lineNumber,
            queryText: queryText.substring(0, 200),
            queryType,
            tables: [],
            columns: [],
            confidence: 0.5,
          });
        }
      }

      // Find SQLAlchemy queries
      while ((match = sqlAlchemyPattern.exec(line)) !== null) {
        const tableName = match[1];
        const columnName = match[2];

        tables.push({
          name: tableName,
          lineNumber,
          accessType: 'READ',
        });

        columns.push({
          name: columnName,
          table: tableName,
          lineNumber,
          context: 'where',
          snippet: line.trim(),
          confidence: 0.9,
        });
      }

      // Find function definitions
      const funcMatch = line.match(funcPattern);
      if (funcMatch) {
        functions.push({
          name: funcMatch[1],
          lineNumber,
          parameters: funcMatch[2].split(',').map(p => p.trim()).filter(p => p),
        });
      }

      // Find assignments (data flows)
      const assignPattern = /(\w+)\[?['"]?(\w+)['"]?\]?\s*=\s*(\w+)\[?['"]?(\w+)['"]?\]?/;
      const assignMatch = line.match(assignPattern);
      if (assignMatch) {
        dataFlows.push({
          from: { field: assignMatch[4], source: assignMatch[3] },
          to: { field: assignMatch[2], source: assignMatch[1] },
          transformation: 'assignment',
          lineNumber,
          confidence: 0.8,
        });
      }
    }

    return {
      language: 'python',
      filePath,
      tables,
      columns,
      functions,
      sqlQueries,
      dataFlows,
      confidence: this.calculateOverallConfidence(tables.length, columns.length, sqlQueries.length),
      parseTime: 0,
    };
  }

  /**
   * Parse SQL code (PL/SQL or T-SQL)
   */
  private async parseSQL(
    code: string,
    filePath: string,
    dialect: 'plsql' | 'tsql'
  ): Promise<ParseResult> {
    const tables: TableReference[] = [];
    const columns: ColumnReference[] = [];
    const sqlQueries: SqlQuery[] = [];
    const functions: FunctionReference[] = [];

    // Split into individual statements (basic approach)
    const statements = code.split(';').filter(s => s.trim());

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt) continue;

      try {
        const parsed = this.parseEmbeddedSQL(stmt, dialect === 'plsql' ? 'postgresql' : 'mssql');

        // Determine query type
        let queryType: SqlQuery['queryType'] = 'SELECT';
        if (stmt.match(/^\s*INSERT/i)) queryType = 'INSERT';
        else if (stmt.match(/^\s*UPDATE/i)) queryType = 'UPDATE';
        else if (stmt.match(/^\s*DELETE/i)) queryType = 'DELETE';
        else if (stmt.match(/^\s*MERGE/i)) queryType = 'MERGE';

        sqlQueries.push({
          lineNumber: i + 1,
          queryText: stmt.substring(0, 200),
          queryType,
          tables: parsed.tables,
          columns: parsed.columns,
          confidence: 0.95,
        });

        // Add tables
        parsed.tables.forEach(tableName => {
          let accessType: AccessType = 'READ';
          if (queryType === 'INSERT') accessType = 'INSERT';
          else if (queryType === 'UPDATE') accessType = 'UPDATE';
          else if (queryType === 'DELETE') accessType = 'DELETE';

          tables.push({
            name: tableName,
            lineNumber: i + 1,
            accessType,
          });
        });

        // Add columns
        parsed.columns.forEach(columnName => {
          columns.push({
            name: columnName,
            lineNumber: i + 1,
            context: queryType === 'SELECT' ? 'select' : 'update',
            snippet: stmt.substring(0, 100),
            confidence: 0.95,
          });
        });
      } catch (err) {
        log.warn(`failed to parse SQL statement at line ${i + 1}:`, err);
      }
    }

    // Find procedure/function definitions
    const procPattern = /(?:CREATE|ALTER)\s+(?:PROCEDURE|FUNCTION)\s+(\w+)/gi;
    let match;
    while ((match = procPattern.exec(code)) !== null) {
      functions.push({
        name: match[1],
        lineNumber: 1, // Would need more complex parsing for exact line
        parameters: [],
      });
    }

    return {
      language: dialect,
      filePath,
      tables,
      columns,
      functions,
      sqlQueries,
      dataFlows: [],
      confidence: this.calculateOverallConfidence(tables.length, columns.length, sqlQueries.length),
      parseTime: 0,
    };
  }

  /**
   * Parse TypeScript code using regex patterns
   */
  private async parseTypeScript(code: string, filePath: string): Promise<ParseResult> {
    // Similar to C# but with TypeScript-specific patterns
    const lines = code.split('\n');
    const tables: TableReference[] = [];
    const columns: ColumnReference[] = [];
    const sqlQueries: SqlQuery[] = [];
    const functions: FunctionReference[] = [];

    // Pattern for Prisma/TypeORM: prisma.user.findMany()
    const ormPattern = /(?:prisma|repository|orm)\.(\w+)\.(?:findMany|findOne|findFirst|create|update|delete)/gi;

    // Pattern for SQL template strings
    const sqlTemplatePattern = /`(SELECT|INSERT|UPDATE|DELETE)[\s\S]*?`/gi;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Find ORM table references
      let match;
      while ((match = ormPattern.exec(line)) !== null) {
        const tableName = match[1];

        let accessType: AccessType = 'READ';
        if (line.includes('.create')) accessType = 'INSERT';
        else if (line.includes('.update')) accessType = 'UPDATE';
        else if (line.includes('.delete')) accessType = 'DELETE';

        tables.push({
          name: tableName,
          lineNumber,
          accessType,
        });
      }

      // Find SQL in template strings
      while ((match = sqlTemplatePattern.exec(line)) !== null) {
        const queryText = match[0].replace(/^`/, '').replace(/`$/, '');
        const queryType = match[1].toUpperCase() as SqlQuery['queryType'];

        try {
          const parsed = this.parseEmbeddedSQL(queryText, 'postgresql');
          sqlQueries.push({
            lineNumber,
            queryText: queryText.substring(0, 200),
            queryType,
            tables: parsed.tables,
            columns: parsed.columns,
            confidence: 0.85,
          });
        } catch (err) {
          sqlQueries.push({
            lineNumber,
            queryText: queryText.substring(0, 200),
            queryType,
            tables: [],
            columns: [],
            confidence: 0.5,
          });
        }
      }

      // Find function definitions
      const funcPattern = /(?:function|const|let)\s+(\w+)\s*(?:=\s*)?(?:async\s*)?\(/;
      const funcMatch = line.match(funcPattern);
      if (funcMatch) {
        functions.push({
          name: funcMatch[1],
          lineNumber,
          parameters: [],
        });
      }
    }

    return {
      language: 'typescript',
      filePath,
      tables,
      columns,
      functions,
      sqlQueries,
      dataFlows: [],
      confidence: this.calculateOverallConfidence(tables.length, columns.length, sqlQueries.length),
      parseTime: 0,
    };
  }

  /**
   * Parse embedded SQL string using node-sql-parser
   */
  private parseEmbeddedSQL(
    sql: string,
    dialect: 'postgresql' | 'mssql'
  ): { tables: string[]; columns: string[] } {
    try {
      const ast = this.sqlParser.astify(sql, { database: dialect });
      const tables = new Set<string>();
      const columns = new Set<string>();

      // Extract tables and columns from AST
      this.extractFromAST(ast, tables, columns);

      return {
        tables: Array.from(tables),
        columns: Array.from(columns),
      };
    } catch (err) {
      // Fallback to regex-based extraction
      return this.fallbackSQLParse(sql);
    }
  }

  /**
   * Extract tables and columns from SQL AST
   */
  private extractFromAST(
    ast: any,
    tables: Set<string>,
    columns: Set<string>
  ): void {
    if (!ast) return;

    if (Array.isArray(ast)) {
      ast.forEach(node => this.extractFromAST(node, tables, columns));
      return;
    }

    if (typeof ast !== 'object') return;

    // Extract table names
    if (ast.table) {
      if (typeof ast.table === 'string') {
        tables.add(ast.table);
      } else if (ast.table.table) {
        tables.add(ast.table.table);
      }
    }

    // Extract column names
    if (ast.column) {
      if (typeof ast.column === 'string') {
        columns.add(ast.column);
      } else if (ast.column.column) {
        columns.add(ast.column.column);
      }
    }

    // Recurse through object properties
    Object.values(ast).forEach(value => {
      if (typeof value === 'object') {
        this.extractFromAST(value, tables, columns);
      }
    });
  }

  /**
   * Fallback SQL parsing using regex
   */
  private fallbackSQLParse(sql: string): { tables: string[]; columns: string[] } {
    const tables = new Set<string>();
    const columns = new Set<string>();

    // Extract table names from FROM and JOIN clauses
    const fromPattern = /(?:FROM|JOIN)\s+(\w+)/gi;
    let match;
    while ((match = fromPattern.exec(sql)) !== null) {
      tables.add(match[1]);
    }

    // Extract column names from SELECT clause
    const selectPattern = /SELECT\s+(.*?)\s+FROM/is;
    const selectMatch = sql.match(selectPattern);
    if (selectMatch) {
      const columnList = selectMatch[1];
      const columnPattern = /(?:^|,)\s*(?:\w+\.)?([\w*]+)(?:\s+as\s+\w+)?/gi;
      while ((match = columnPattern.exec(columnList)) !== null) {
        if (match[1] !== '*') {
          columns.add(match[1]);
        }
      }
    }

    return {
      tables: Array.from(tables),
      columns: Array.from(columns),
    };
  }

  /**
   * Trace a specific field across multiple files
   */
  async traceField(
    fieldName: string,
    files: Array<{ path: string; content: string; language: SupportedLanguage }>,
    contextLines: number = 3
  ): Promise<FieldTraceResult> {
    const occurrences: FieldOccurrence[] = [];

    for (const file of files) {
      const lines = file.content.split('\n');
      const pattern = new RegExp(`\\b${fieldName}\\b`, 'gi');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (pattern.test(line)) {
          const lineNumber = i + 1;
          const before = lines.slice(Math.max(0, i - contextLines), i).join('\n');
          const after = lines.slice(i + 1, Math.min(lines.length, i + 1 + contextLines)).join('\n');

          // Determine usage type
          let usage: UsageType = 'select';
          if (line.includes('=') && line.indexOf('=') < line.indexOf(fieldName)) {
            usage = 'assignment';
          } else if (line.match(/SELECT/i)) {
            usage = 'select';
          } else if (line.match(/WHERE/i)) {
            usage = 'where';
          } else if (line.match(/INSERT/i)) {
            usage = 'insert';
          } else if (line.match(/UPDATE/i)) {
            usage = 'update';
          }

          occurrences.push({
            file: file.path,
            lineNumber,
            usage,
            context: { before, line, after },
            confidence: 0.9,
            pattern: 'exact_match',
          });
        }
      }
    }

    return {
      field: fieldName,
      totalOccurrences: occurrences.length,
      occurrences,
    };
  }

  /**
   * Check if a name is likely a table name (heuristic)
   */
  private isLikelyTableName(name: string): boolean {
    // Tables are usually PascalCase and plural
    if (name.length < 3) return false;
    if (name.match(/^[A-Z]/)) return true;
    if (name.endsWith('s') || name.endsWith('List') || name.endsWith('Set')) return true;
    return false;
  }

  /**
   * Calculate overall confidence score
   */
  private calculateOverallConfidence(
    tablesFound: number,
    columnsFound: number,
    queriesFound: number
  ): number {
    // More findings = higher confidence
    const score = Math.min(
      0.95,
      0.5 + (tablesFound * 0.1) + (columnsFound * 0.05) + (queriesFound * 0.15)
    );
    return Math.max(0.5, score);
  }
}

export const codeParserService = new CodeParserService();
