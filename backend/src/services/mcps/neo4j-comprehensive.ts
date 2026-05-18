import { Neo4jMCP } from './neo4j';
import { createLogger } from '../../utils/logger';

const log = createLogger('neo4j-comprehensive');

/**
 * Comprehensive Neo4j MCP for Legacy Codebase Knowledge Graph
 * Wraps the tools from index.js for data lineage and code analysis
 *
 * This provides access to the full graph schema including:
 * - ExecutionFlow, Snippet, Dbcall, DatabaseEntity, DatabaseField
 * - Variable, Job, Step, Parent, Module, FunctionalModule
 * - InputEntity, InputInterface, ReportInterface
 *
 * All queries use run_id for version filtering.
 */

export interface Neo4jStats {
  nodeLabels: Array<{ label: string; count: number }>;
  availableRunIds: number[];
  totalNodes?: number;
  totalRelationships?: number;
}

export interface FieldLineageResult {
  field: {
    field_name: string;
    entity_key?: string;
    entity_name?: string;
  };
  snippets: Array<{
    snippet_key: string;
    snippet_name: string;
    file_name?: string;
    line_number?: number;
  }>;
  dbcalls: Array<{
    dbcall_key: string;
    operation_type: string;
    query?: string;
  }>;
  execution_flows: Array<{
    flow_key: string;
    flow_name: string;
  }>;
}

export interface VariableLineageResult {
  variable: {
    key: string;
    term: string;
    type?: string;
  };
  snippets: Array<{
    snippet_key: string;
    snippet_name: string;
    file_name?: string;
  }>;
  transformations: Array<{
    from_snippet: string;
    to_snippet: string;
    transformation_type?: string;
  }>;
}

export interface CallChainResult {
  snippet_key: string;
  snippet_name: string;
  call_chains: Array<{
    path: string[];
    depth: number;
    target_snippet?: string;
  }>;
}

export interface ExecutionFlowResult {
  flow_key: string;
  flow_name: string;
  entry_point?: string;
  snippets: Array<{
    snippet_key: string;
    snippet_name: string;
  }>;
  db_operations?: Array<{
    operation_type: string;
    entity_name: string;
  }>;
}

/**
 * Comprehensive Neo4j MCP with all lineage and analysis tools
 */
export const Neo4jComprehensiveMCP = {
  /**
   * Get database statistics and available run_ids
   * Use this FIRST to understand what data is available
   */
  async getStats(runId?: number): Promise<Neo4jStats> {
    log.info('fetching Neo4j stats', { runId });

    if (!(await Neo4jMCP.isConfigured())) {
      throw new Error('Neo4j is not configured');
    }

    const stats: Neo4jStats = {
      nodeLabels: [],
      availableRunIds: [],
    };

    try {
      // Get node counts by label
      const labelQuery = runId
        ? `
          MATCH (n)
          WHERE n.run_id = $runId
          RETURN labels(n) AS nodeLabels, count(*) AS cnt
        `
        : `
          CALL db.labels() YIELD label
          MATCH (n) WHERE label IN labels(n)
          RETURN label AS nodeLabels, count(n) AS cnt
          LIMIT 50
        `;

      const labelResult = await Neo4jMCP.runCypher(
        labelQuery,
        runId ? { runId } : {}
      );

      stats.nodeLabels = labelResult.records.map((r: any) => ({
        label: Array.isArray(r.nodeLabels) ? r.nodeLabels[0] : r.nodeLabels,
        count: Number(r.cnt),
      }));

      // Get available run_ids
      const runIdsQuery = `
        MATCH (n)
        WHERE n.run_id IS NOT NULL
        RETURN DISTINCT n.run_id AS runId
        ORDER BY runId DESC
        LIMIT 20
      `;

      const runIdsResult = await Neo4jMCP.runCypher(runIdsQuery);
      stats.availableRunIds = runIdsResult.records.map((r: any) => Number(r.runId));

      log.info('stats retrieved successfully', {
        labelCount: stats.nodeLabels.length,
        runIdCount: stats.availableRunIds.length,
      });

      return stats;
    } catch (err) {
      log.error('failed to get stats:', err);
      throw err;
    }
  },

  /**
   * Find field lineage: DatabaseEntity → Dbcall → Snippet → ExecutionFlow
   * Shows which code touches the field and what operations
   */
  async findFieldLineage(
    fieldName: string,
    runId: number,
    operationType?: string,
    limit: number = 100
  ): Promise<FieldLineageResult> {
    log.info('finding field lineage', { fieldName, runId, operationType });

    if (!(await Neo4jMCP.isConfigured())) {
      throw new Error('Neo4j is not configured');
    }

    const cypher = `
      MATCH (dbf:DatabaseField {run_id: $runId})
      WHERE dbf.name = $fieldName OR toLower(dbf.name) = toLower($fieldName)
      OPTIONAL MATCH (dbf)<-[:HAS_FIELD]-(dbe:DatabaseEntity {run_id: $runId})
      OPTIONAL MATCH (dbe)<-[:USES_ENTITY]-(dbc:Dbcall {run_id: $runId})
      ${operationType ? 'WHERE dbc.operation_type = $operationType' : ''}
      OPTIONAL MATCH (dbc)<-[:CONTAINS_DB_CALLS]-(s:Snippet {run_id: $runId})
      OPTIONAL MATCH (s)-[:PARTICIPATES_IN_FLOW]->(ef:ExecutionFlow {run_id: $runId})
      OPTIONAL MATCH (s)-[:IS_A_CHILD_OF_PARENT]->(p:Parent)
      WITH dbf, dbe,
           collect(DISTINCT {
             snippet_key: s.key,
             snippet_name: COALESCE(s.function_name, s.name),
             file_name: COALESCE(p.name, s.file_name),
             line_number: s.start_line
           }) AS snippets,
           collect(DISTINCT {
             dbcall_key: dbc.key,
             operation_type: dbc.operation_type,
             query: dbc.query
           }) AS dbcalls,
           collect(DISTINCT {
             flow_key: ef.key,
             flow_name: ef.name
           }) AS flows
      RETURN {
        field_name: dbf.name,
        entity_key: dbe.key,
        entity_name: dbe.name
      } AS field,
      snippets,
      dbcalls,
      flows AS execution_flows
      LIMIT $limit
    `;

    try {
      const result = await Neo4jMCP.runCypher(cypher, {
        fieldName,
        runId,
        operationType: operationType || null,
        limit,
      });

      if (result.records.length === 0) {
        log.warn('no field lineage found', { fieldName, runId });
        return {
          field: { field_name: fieldName },
          snippets: [],
          dbcalls: [],
          execution_flows: [],
        };
      }

      const record = result.records[0];
      log.info('field lineage found', {
        snippets: record.snippets?.length || 0,
        dbcalls: record.dbcalls?.length || 0,
        flows: record.execution_flows?.length || 0,
      });

      return record as any;
    } catch (err) {
      log.error('field lineage query failed:', err);
      throw err;
    }
  },

  /**
   * Trace variable lineage through the codebase
   * Returns transformation chain showing snippets and call relationships
   */
  async getVariableLineage(
    variableTerm: string,
    runId: number,
    direction: 'forward' | 'backward' | 'both' = 'both',
    limit: number = 100
  ): Promise<VariableLineageResult> {
    log.info('getting variable lineage', { variableTerm, runId, direction });

    if (!(await Neo4jMCP.isConfigured())) {
      throw new Error('Neo4j is not configured');
    }

    const cypher = `
      MATCH (v:Variable {run_id: $runId})
      WHERE v.term = $variableTerm
      MATCH (s:Snippet {run_id: $runId})-[:CONTAINS_VARIABLE]->(v)
      OPTIONAL MATCH (s)-[:IS_A_CHILD_OF_PARENT]->(p:Parent)
      ${
        direction === 'forward'
          ? 'OPTIONAL MATCH path = (s)-[:CALLS*1..3]->(target:Snippet)'
          : direction === 'backward'
          ? 'OPTIONAL MATCH path = (source:Snippet)-[:CALLS*1..3]->(s)'
          : 'OPTIONAL MATCH path = (related:Snippet)-[:CALLS*0..3]-(s)'
      }
      WITH v,
           collect(DISTINCT {
             snippet_key: s.key,
             snippet_name: COALESCE(s.function_name, s.name),
             file_name: COALESCE(p.name, s.file_name)
           }) AS snippets,
           collect(DISTINCT {
             from_snippet: COALESCE(startNode(relationships(path)[0]).function_name, startNode(relationships(path)[0]).name),
             to_snippet: COALESCE(endNode(relationships(path)[0]).function_name, endNode(relationships(path)[0]).name),
             transformation_type: type(relationships(path)[0])
           }) AS transformations
      RETURN {
        key: v.key,
        term: v.term,
        type: v.type
      } AS variable,
      snippets,
      transformations
      LIMIT $limit
    `;

    try {
      const result = await Neo4jMCP.runCypher(cypher, {
        variableTerm,
        runId,
        limit,
      });

      if (result.records.length === 0) {
        log.warn('no variable lineage found', { variableTerm, runId });
        return {
          variable: { key: '', term: variableTerm },
          snippets: [],
          transformations: [],
        };
      }

      const record = result.records[0];
      log.info('variable lineage found', {
        snippets: record.snippets?.length || 0,
        transformations: record.transformations?.length || 0,
      });

      return record as any;
    } catch (err) {
      log.error('variable lineage query failed:', err);
      throw err;
    }
  },

  /**
   * Trace call relationships from a snippet
   * Returns call chains up to max_depth
   */
  async traceCallChain(
    snippetKey: string,
    runId: number,
    maxDepth: number = 5,
    direction: 'outgoing' | 'incoming' | 'both' = 'outgoing',
    limit: number = 200
  ): Promise<CallChainResult> {
    log.info('tracing call chain', { snippetKey, runId, maxDepth, direction });

    if (!(await Neo4jMCP.isConfigured())) {
      throw new Error('Neo4j is not configured');
    }

    const directionPattern =
      direction === 'outgoing'
        ? '-[:CALLS*1..' + maxDepth + ']->'
        : direction === 'incoming'
        ? '<-[:CALLS*1..' + maxDepth + ']-'
        : '-[:CALLS*1..' + maxDepth + ']-';

    const cypher = `
      MATCH (s:Snippet {key: $snippetKey, run_id: $runId})
      OPTIONAL MATCH path = (s)${directionPattern}(target:Snippet {run_id: $runId})
      WITH s, path, target,
           [n IN nodes(path) | COALESCE(n.function_name, n.name)] AS pathNames,
           length(path) AS depth
      ORDER BY depth
      WITH s,
           collect(DISTINCT {
             path: pathNames,
             depth: depth,
             target_snippet: COALESCE(target.function_name, target.name)
           })[0..$limit] AS call_chains
      RETURN s.key AS snippet_key,
             COALESCE(s.function_name, s.name) AS snippet_name,
             call_chains
      LIMIT 1
    `;

    try {
      const result = await Neo4jMCP.runCypher(cypher, {
        snippetKey,
        runId,
        limit,
      });

      if (result.records.length === 0) {
        log.warn('no call chains found', { snippetKey, runId });
        return {
          snippet_key: snippetKey,
          snippet_name: 'unknown',
          call_chains: [],
        };
      }

      const record = result.records[0];
      log.info('call chains found', {
        chainCount: record.call_chains?.length || 0,
      });

      return record as any;
    } catch (err) {
      log.error('call chain tracing failed:', err);
      throw err;
    }
  },

  /**
   * Get all DB operations inside a snippet
   * Returns operation_type, entity, query
   */
  async getDbCalls(snippetKey: string, runId: number): Promise<Array<{
    dbcall_key: string;
    operation_type: string;
    entity_name?: string;
    entity_type?: string;
    query?: string;
  }>> {
    log.info('getting DB calls', { snippetKey, runId });

    if (!(await Neo4jMCP.isConfigured())) {
      throw new Error('Neo4j is not configured');
    }

    const cypher = `
      MATCH (s:Snippet {key: $snippetKey, run_id: $runId})
      MATCH (s)-[:CONTAINS_DB_CALLS]->(dbc:Dbcall {run_id: $runId})
      OPTIONAL MATCH (dbc)-[:USES_ENTITY]->(dbe:DatabaseEntity)
      RETURN dbc.key AS dbcall_key,
             dbc.operation_type AS operation_type,
             dbe.name AS entity_name,
             dbe.type AS entity_type,
             dbc.query AS query
      ORDER BY dbc.key
    `;

    try {
      const result = await Neo4jMCP.runCypher(cypher, { snippetKey, runId });
      log.info('DB calls retrieved', { count: result.records.length });
      return result.records as any;
    } catch (err) {
      log.error('get DB calls failed:', err);
      throw err;
    }
  },

  /**
   * Search for code snippets by file path pattern or name
   * Returns matched snippets with their execution flow context
   */
  async searchSnippets(
    runId: number,
    filePathPattern?: string,
    namePattern?: string,
    snippetType?: 'ROOT' | 'REGULAR',
    limit: number = 100
  ): Promise<Array<{
    snippet_key: string;
    snippet_name: string;
    file_name?: string;
    snippet_type?: string;
    execution_flows?: string[];
  }>> {
    log.info('searching snippets', {
      runId,
      filePathPattern,
      namePattern,
      snippetType,
    });

    if (!(await Neo4jMCP.isConfigured())) {
      throw new Error('Neo4j is not configured');
    }

    const conditions: string[] = ['s.run_id = $runId'];
    const params: Record<string, any> = { runId, limit };

    if (namePattern) {
      conditions.push('(s.name CONTAINS $namePattern OR s.function_name CONTAINS $namePattern)');
      params.namePattern = namePattern;
    }

    if (snippetType) {
      conditions.push('s.type = $snippetType');
      params.snippetType = snippetType;
    }

    const cypher = `
      MATCH (s:Snippet)
      ${conditions.length > 1 ? 'WHERE ' + conditions.join(' AND ') : 'WHERE ' + conditions[0]}
      OPTIONAL MATCH (s)-[:IS_A_CHILD_OF_PARENT]->(p:Parent)
      OPTIONAL MATCH (s)-[:PARTICIPATES_IN_FLOW]->(ef:ExecutionFlow)
      ${filePathPattern ? 'WHERE s.file_path CONTAINS $filePathPattern OR p.name CONTAINS $filePathPattern' : ''}
      WITH s, p, collect(DISTINCT ef.name) AS flows
      RETURN s.key AS snippet_key,
             COALESCE(s.function_name, s.name) AS snippet_name,
             COALESCE(p.name, s.file_name) AS file_name,
             s.type AS snippet_type,
             flows AS execution_flows
      LIMIT $limit
    `;

    if (filePathPattern) {
      params.filePathPattern = filePathPattern;
    }

    try {
      const result = await Neo4jMCP.runCypher(cypher, params);
      log.info('snippets found', { count: result.records.length });
      return result.records as any;
    } catch (err) {
      log.error('snippet search failed:', err);
      throw err;
    }
  },

  /**
   * Get location metadata for a snippet
   * Returns snippet_key, snippet_name, file_name
   */
  async getSnippetLocation(snippetKey: string, runId: number): Promise<{
    snippet_key: string;
    snippet_name: string;
    file_name?: string;
    file_path?: string;
    start_line?: number;
    end_line?: number;
  }> {
    log.info('getting snippet location', { snippetKey, runId });

    if (!(await Neo4jMCP.isConfigured())) {
      throw new Error('Neo4j is not configured');
    }

    const cypher = `
      MATCH (s:Snippet {key: $snippetKey, run_id: $runId})
      OPTIONAL MATCH (s)-[:IS_A_CHILD_OF_PARENT]->(p:Parent)
      RETURN s.key AS snippet_key,
             COALESCE(s.function_name, s.name) AS snippet_name,
             COALESCE(p.name, s.file_name) AS file_name,
             s.file_path AS file_path,
             s.start_line AS start_line,
             s.end_line AS end_line
    `;

    try {
      const result = await Neo4jMCP.runCypher(cypher, { snippetKey, runId });

      if (result.records.length === 0) {
        log.warn('snippet not found', { snippetKey, runId });
        throw new Error(`Snippet ${snippetKey} not found`);
      }

      log.info('snippet location found');
      return result.records[0] as any;
    } catch (err) {
      log.error('get snippet location failed:', err);
      throw err;
    }
  },

  /**
   * List all execution flows for a run_id
   * Returns each flow with key and name
   */
  async listExecutionFlows(
    runId: number,
    limit: number = 100
  ): Promise<Array<{
    flow_key: string;
    flow_name: string;
    entry_point?: string;
    snippet_count?: number;
  }>> {
    log.info('listing execution flows', { runId, limit });

    if (!(await Neo4jMCP.isConfigured())) {
      throw new Error('Neo4j is not configured');
    }

    const cypher = `
      MATCH (ef:ExecutionFlow {run_id: $runId})
      OPTIONAL MATCH (ef)<-[:PARTICIPATES_IN_FLOW]-(s:Snippet)
      WITH ef, count(DISTINCT s) AS snippet_count
      RETURN ef.key AS flow_key,
             ef.name AS flow_name,
             ef.entry_point AS entry_point,
             snippet_count
      ORDER BY ef.name
      LIMIT $limit
    `;

    try {
      const result = await Neo4jMCP.runCypher(cypher, { runId, limit });
      log.info('execution flows listed', { count: result.records.length });
      return result.records as any;
    } catch (err) {
      log.error('list execution flows failed:', err);
      throw err;
    }
  },

  /**
   * Get a bounded subgraph for an execution flow
   * Returns all snippets in the flow, their call relationships, and database operations
   */
  async getExecutionFlowSubgraph(
    flowKey: string,
    runId: number,
    maxDepth: number = 3,
    limit: number = 200
  ): Promise<ExecutionFlowResult> {
    log.info('getting execution flow subgraph', { flowKey, runId, maxDepth });

    if (!(await Neo4jMCP.isConfigured())) {
      throw new Error('Neo4j is not configured');
    }

    const cypher = `
      MATCH (ef:ExecutionFlow {key: $flowKey, run_id: $runId})
      MATCH (ef)<-[:PARTICIPATES_IN_FLOW]-(s:Snippet {run_id: $runId})
      OPTIONAL MATCH (s)-[:CALLS*1..${maxDepth}]->(related:Snippet {run_id: $runId})
      OPTIONAL MATCH (s)-[:CONTAINS_DB_CALLS]->(dbc:Dbcall)-[:USES_ENTITY]->(dbe:DatabaseEntity)
      WITH ef,
           collect(DISTINCT {
             snippet_key: s.key,
             snippet_name: COALESCE(s.function_name, s.name)
           }) AS snippets,
           collect(DISTINCT {
             operation_type: dbc.operation_type,
             entity_name: dbe.name
           }) AS db_operations
      RETURN ef.key AS flow_key,
             ef.name AS flow_name,
             ef.entry_point AS entry_point,
             snippets[0..$limit] AS snippets,
             db_operations[0..$limit] AS db_operations
    `;

    try {
      const result = await Neo4jMCP.runCypher(cypher, { flowKey, runId, limit });

      if (result.records.length === 0) {
        log.warn('execution flow not found', { flowKey, runId });
        return {
          flow_key: flowKey,
          flow_name: 'unknown',
          snippets: [],
        };
      }

      const record = result.records[0];
      log.info('execution flow subgraph retrieved', {
        snippets: record.snippets?.length || 0,
        dbOps: record.db_operations?.length || 0,
      });

      return record as any;
    } catch (err) {
      log.error('get execution flow subgraph failed:', err);
      throw err;
    }
  },

  /**
   * Get entity usage spread: how many snippets and dbcalls touch each DatabaseEntity
   */
  async getEntityUsageSpread(
    runId: number,
    minSnippets: number = 0,
    limit: number = 50
  ): Promise<Array<{
    entity_key: string;
    entity_name: string;
    entity_type?: string;
    snippet_count: number;
    dbcall_count: number;
  }>> {
    log.info('getting entity usage spread', { runId, minSnippets, limit });

    if (!(await Neo4jMCP.isConfigured())) {
      throw new Error('Neo4j is not configured');
    }

    const cypher = `
      MATCH (dbe:DatabaseEntity {run_id: $runId})
      OPTIONAL MATCH (dbe)<-[:USES_ENTITY]-(dbc:Dbcall {run_id: $runId})
      OPTIONAL MATCH (dbc)<-[:CONTAINS_DB_CALLS]-(s:Snippet)
      WITH dbe,
           count(DISTINCT s) AS snippet_count,
           count(DISTINCT dbc) AS dbcall_count
      WHERE snippet_count >= $minSnippets
      RETURN dbe.key AS entity_key,
             dbe.name AS entity_name,
             dbe.type AS entity_type,
             snippet_count,
             dbcall_count
      ORDER BY snippet_count DESC, dbcall_count DESC
      LIMIT $limit
    `;

    try {
      const result = await Neo4jMCP.runCypher(cypher, { runId, minSnippets, limit });
      log.info('entity usage spread retrieved', { count: result.records.length });
      return result.records as any;
    } catch (err) {
      log.error('get entity usage spread failed:', err);
      throw err;
    }
  },
};
