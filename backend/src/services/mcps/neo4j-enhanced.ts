import { Neo4jMCP } from './neo4j';
import { FilesystemMCP } from './filesystem';
import { createLogger } from '../../utils/logger';

const log = createLogger('neo4j-enhanced');

export interface GraphSchema {
  nodeLabels: string[];
  relationshipTypes: string[];
  propertyKeys: Record<string, string[]>;
  sampleCounts: Record<string, number>;
  constraints: Array<{ label: string; property: string; type: string }>;
  indexes: Array<{ label: string; properties: string[] }>;
}

export interface LineageQueryOptions {
  fieldName: string;
  direction: 'upstream' | 'downstream' | 'both';
  maxDepth: number;
  includeCode?: boolean;
  filters?: Record<string, unknown>;
}

export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  discrepancies: Discrepancy[];
  actualCode?: string;
  graphCode?: string;
}

export interface Discrepancy {
  type: 'missing' | 'incorrect' | 'outdated' | 'location_mismatch';
  expected: unknown;
  actual: unknown;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

export interface FieldMatch {
  fieldName: string;
  similarity: number;
  nodeId: string;
  nodeLabel: string;
  properties: Record<string, unknown>;
}

/**
 * Enhanced Neo4j MCP with dynamic query generation and validation
 */
export const Neo4jMCPEnhanced = {
  /**
   * Introspect Neo4j graph schema to discover structure
   */
  async introspectSchema(sampleSize: number = 100): Promise<GraphSchema> {
    if (!(await Neo4jMCP.isConfigured())) {
      throw new Error('Neo4j is not configured');
    }

    log.info('introspecting Neo4j schema...');

    const schema: GraphSchema = {
      nodeLabels: [],
      relationshipTypes: [],
      propertyKeys: {},
      sampleCounts: {},
      constraints: [],
      indexes: [],
    };

    try {
      // Get all node labels
      const labelsQuery = 'CALL db.labels() YIELD label RETURN label';
      const labelsResult = await Neo4jMCP.runCypher(labelsQuery);
      schema.nodeLabels = labelsResult.records.map((r: any) => r.label as string);

      // Get all relationship types
      const relsQuery = 'CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType';
      const relsResult = await Neo4jMCP.runCypher(relsQuery);
      schema.relationshipTypes = relsResult.records.map((r: any) => r.relationshipType as string);

      // Get property keys for each node label
      for (const label of schema.nodeLabels) {
        const propsQuery = `
          MATCH (n:\`${label}\`)
          WITH n LIMIT ${sampleSize}
          UNWIND keys(n) as key
          RETURN DISTINCT key
        `;
        try {
          const propsResult = await Neo4jMCP.runCypher(propsQuery);
          schema.propertyKeys[label] = propsResult.records.map((r: any) => r.key as string);

          // Get count for this label
          const countQuery = `MATCH (n:\`${label}\`) RETURN count(n) as count`;
          const countResult = await Neo4jMCP.runCypher(countQuery);
          schema.sampleCounts[label] = (countResult.records[0]?.count as number) || 0;
        } catch (err) {
          log.warn(`failed to get properties for label ${label}:`, err);
          schema.propertyKeys[label] = [];
          schema.sampleCounts[label] = 0;
        }
      }

      // Get constraints (Neo4j 4.0+)
      try {
        const constraintsQuery = 'SHOW CONSTRAINTS YIELD name, labelsOrTypes, properties, type RETURN name, labelsOrTypes, properties, type';
        const constraintsResult = await Neo4jMCP.runCypher(constraintsQuery);
        schema.constraints = constraintsResult.records.map((r: any) => ({
          label: r.labelsOrTypes?.[0] || 'unknown',
          property: r.properties?.[0] || 'unknown',
          type: r.type as string,
        }));
      } catch (err) {
        // Fallback for older Neo4j versions
        log.info('using fallback constraints query for older Neo4j');
        try {
          const constraintsQuery = 'CALL db.constraints() YIELD description RETURN description';
          const constraintsResult = await Neo4jMCP.runCypher(constraintsQuery);
          // Parse description strings - basic approach
          schema.constraints = constraintsResult.records.map((r: any) => {
            const desc = r.description as string;
            return {
              label: 'parsed',
              property: 'parsed',
              type: desc.includes('UNIQUE') ? 'UNIQUENESS' : 'OTHER',
            };
          });
        } catch (innerErr) {
          log.warn('could not fetch constraints:', innerErr);
        }
      }

      // Get indexes (Neo4j 4.0+)
      try {
        const indexesQuery = 'SHOW INDEXES YIELD labelsOrTypes, properties RETURN labelsOrTypes, properties';
        const indexesResult = await Neo4jMCP.runCypher(indexesQuery);
        schema.indexes = indexesResult.records.map((r: any) => ({
          label: r.labelsOrTypes?.[0] || 'unknown',
          properties: r.properties || [],
        }));
      } catch (err) {
        log.info('using fallback indexes query for older Neo4j');
        try {
          const indexesQuery = 'CALL db.indexes() YIELD tokenNames, properties RETURN tokenNames, properties';
          const indexesResult = await Neo4jMCP.runCypher(indexesQuery);
          schema.indexes = indexesResult.records.map((r: any) => ({
            label: r.tokenNames?.[0] || 'unknown',
            properties: r.properties || [],
          }));
        } catch (innerErr) {
          log.warn('could not fetch indexes:', innerErr);
        }
      }

      log.info(`schema introspection complete: ${schema.nodeLabels.length} labels, ${schema.relationshipTypes.length} rels`);
      return schema;
    } catch (err) {
      log.error('schema introspection failed:', err);
      throw err;
    }
  },

  /**
   * Build dynamic Cypher query for lineage tracing based on schema
   */
  buildLineageQuery(options: LineageQueryOptions, schema: GraphSchema): string {
    const { fieldName, direction, maxDepth, includeCode = true } = options;

    log.info(`building lineage query for field="${fieldName}" direction=${direction} depth=${maxDepth}`);

    // Detect which node labels might contain field references
    const relevantLabels = this.findRelevantLabels(fieldName, schema);

    if (relevantLabels.length === 0) {
      log.warn(`no relevant labels found for field ${fieldName}, using generic query`);
      return this.buildGenericLineageQuery(fieldName, direction, maxDepth, includeCode);
    }

    // Build label filter
    const labelFilter = relevantLabels.map(l => `n:\`${l}\``).join(' OR ');

    let query = '';

    switch (direction) {
      case 'upstream':
        query = `
          MATCH (n)
          WHERE (${labelFilter})
            AND (n.name = $fieldName OR n.field_name = $fieldName OR n.column_name = $fieldName)
          OPTIONAL MATCH path = (source)-[*1..${maxDepth}]->(n)
          WHERE source:Table OR source:Column OR source:Database OR source:File
          WITH n, path, source
          ORDER BY length(path) DESC
          LIMIT 50
          RETURN n as targetNode,
                 collect(DISTINCT source) as sources,
                 collect(DISTINCT path) as paths,
                 collect(DISTINCT relationships(path)) as relationships
        `;
        break;

      case 'downstream':
        query = `
          MATCH (n)
          WHERE (${labelFilter})
            AND (n.name = $fieldName OR n.field_name = $fieldName OR n.column_name = $fieldName)
          OPTIONAL MATCH path = (n)-[*1..${maxDepth}]->(consumer)
          WHERE consumer:Table OR consumer:Column OR consumer:API OR consumer:Report OR consumer:UI
          WITH n, path, consumer
          ORDER BY length(path) DESC
          LIMIT 50
          RETURN n as sourceNode,
                 collect(DISTINCT consumer) as consumers,
                 collect(DISTINCT path) as paths,
                 collect(DISTINCT relationships(path)) as relationships
        `;
        break;

      case 'both':
        query = `
          MATCH (n)
          WHERE (${labelFilter})
            AND (n.name = $fieldName OR n.field_name = $fieldName OR n.column_name = $fieldName)
          OPTIONAL MATCH upstreamPath = (source)-[*1..${maxDepth}]->(n)
          WHERE source:Table OR source:Column OR source:Database OR source:File
          OPTIONAL MATCH downstreamPath = (n)-[*1..${maxDepth}]->(consumer)
          WHERE consumer:Table OR consumer:Column OR consumer:API OR consumer:Report OR consumer:UI
          WITH n,
               collect(DISTINCT upstreamPath) as upstreamPaths,
               collect(DISTINCT downstreamPath) as downstreamPaths,
               collect(DISTINCT source) as sources,
               collect(DISTINCT consumer) as consumers
          LIMIT 50
          RETURN n as fieldNode,
                 sources,
                 consumers,
                 upstreamPaths,
                 downstreamPaths
        `;
        break;
    }

    // Add code snippet retrieval if requested
    if (includeCode) {
      query = query.replace(
        'RETURN',
        `OPTIONAL MATCH (n)-[:HAS_SNIPPET]->(snippet:Snippet)
         OPTIONAL MATCH (n)-[:IN_FILE]->(file:File)
         WITH *, collect(DISTINCT snippet) as codeSnippets, collect(DISTINCT file) as files
         RETURN`
      );
      query = query.replace(
        /relationships\s*$/m,
        'relationships,\n         codeSnippets,\n         files'
      );
    }

    log.info('generated dynamic query with relevant labels:', relevantLabels);
    return query.trim();
  },

  /**
   * Find node labels that likely contain field references
   */
  findRelevantLabels(fieldName: string, schema: GraphSchema): string[] {
    const relevant: string[] = [];

    // Keywords that suggest a label contains field/column info
    const fieldKeywords = ['field', 'column', 'variable', 'attribute', 'property', 'data'];
    const nameProperties = ['name', 'field_name', 'column_name', 'fieldName', 'columnName'];

    for (const label of schema.nodeLabels) {
      const labelLower = label.toLowerCase();

      // Check if label name suggests it contains fields
      const hasFieldKeyword = fieldKeywords.some(kw => labelLower.includes(kw));

      // Check if this label has name-related properties
      const props = schema.propertyKeys[label] || [];
      const hasNameProperty = props.some(p =>
        nameProperties.some(np => p.toLowerCase() === np.toLowerCase())
      );

      if (hasFieldKeyword || hasNameProperty) {
        relevant.push(label);
      }
    }

    // Always include common labels if they exist
    const commonLabels = ['Variable', 'Column', 'Field', 'Attribute'];
    for (const common of commonLabels) {
      if (schema.nodeLabels.includes(common) && !relevant.includes(common)) {
        relevant.push(common);
      }
    }

    return relevant;
  },

  /**
   * Build generic lineage query when schema is unknown
   */
  buildGenericLineageQuery(
    fieldName: string,
    direction: string,
    maxDepth: number,
    includeCode: boolean
  ): string {
    return `
      MATCH (n)
      WHERE n.name = $fieldName
         OR n.field_name = $fieldName
         OR n.column_name = $fieldName
         OR n.fieldName = $fieldName
      OPTIONAL MATCH path = (n)-[*1..${maxDepth}]-(related)
      WITH n, path, related
      ORDER BY length(path)
      LIMIT 50
      RETURN n as node,
             collect(DISTINCT path) as paths,
             collect(DISTINCT related) as relatedNodes
    `;
  },

  /**
   * Validate a Neo4j node against actual code
   */
  async validateNode(args: {
    nodeId: string;
    filePath?: string;
    lineNumber?: number;
    fsSandboxRoot?: string;
  }): Promise<ValidationResult> {
    log.info(`validating node ${args.nodeId}`);

    const result: ValidationResult = {
      isValid: false,
      confidence: 0,
      discrepancies: [],
    };

    try {
      // Fetch node from Neo4j
      const nodeQuery = `
        MATCH (n)
        WHERE id(n) = $nodeId
        RETURN n,
               labels(n) as labels,
               properties(n) as props
      `;
      const nodeResult = await Neo4jMCP.runCypher(nodeQuery, { nodeId: parseInt(args.nodeId) });

      if (nodeResult.records.length === 0) {
        result.discrepancies.push({
          type: 'missing',
          expected: `Node ${args.nodeId}`,
          actual: null,
          severity: 'high',
          description: 'Node not found in Neo4j',
        });
        return result;
      }

      const nodeData = nodeResult.records[0];
      const props = nodeData.props as Record<string, unknown>;

      // Extract code reference from node
      const graphFilePath = (props.filePath || props.file_path || props.file) as string | undefined;
      const graphLineNumber = (props.lineNumber || props.line_number || props.line) as number | undefined;
      const graphCode = (props.code || props.snippet || props.content) as string | undefined;

      result.graphCode = graphCode;

      // If we have file path from node, validate against it
      const fileToCheck = args.filePath || graphFilePath;
      const lineToCheck = args.lineNumber || graphLineNumber;

      if (!fileToCheck) {
        result.discrepancies.push({
          type: 'missing',
          expected: 'File path in node or arguments',
          actual: null,
          severity: 'medium',
          description: 'No file path to validate against',
        });
        result.confidence = 0.3;
        return result;
      }

      // Read actual file
      try {
        const fileData = await FilesystemMCP.readFile(
          fileToCheck,
          args.fsSandboxRoot
        );
        result.actualCode = fileData.preview || '';

        // If we have a line number, extract that specific line
        if (lineToCheck && result.actualCode) {
          const lines = result.actualCode.split('\n');
          const actualLine = lines[lineToCheck - 1];

          if (graphCode) {
            const graphCodeClean = graphCode.trim();
            const actualCodeClean = actualLine?.trim() || '';

            // Compare code snippets
            if (graphCodeClean === actualCodeClean) {
              result.isValid = true;
              result.confidence = 0.95;
            } else if (actualCodeClean.includes(graphCodeClean) || graphCodeClean.includes(actualCodeClean)) {
              result.isValid = true;
              result.confidence = 0.8;
              result.discrepancies.push({
                type: 'incorrect',
                expected: graphCodeClean,
                actual: actualCodeClean,
                severity: 'low',
                description: 'Code snippets partially match',
              });
            } else {
              result.isValid = false;
              result.confidence = 0.4;
              result.discrepancies.push({
                type: 'incorrect',
                expected: graphCodeClean,
                actual: actualCodeClean,
                severity: 'high',
                description: 'Code snippets do not match',
              });
            }
          } else {
            // No code in graph to compare, but file exists
            result.isValid = true;
            result.confidence = 0.7;
          }
        } else {
          // No line number, just verify file exists
          result.isValid = true;
          result.confidence = 0.6;
        }

        // Check if file path matches
        if (graphFilePath && graphFilePath !== fileToCheck) {
          result.discrepancies.push({
            type: 'location_mismatch',
            expected: graphFilePath,
            actual: fileToCheck,
            severity: 'medium',
            description: 'File paths do not match',
          });
          result.confidence -= 0.1;
        }

        // Check if line number matches
        if (graphLineNumber && lineToCheck && graphLineNumber !== lineToCheck) {
          result.discrepancies.push({
            type: 'location_mismatch',
            expected: graphLineNumber,
            actual: lineToCheck,
            severity: 'low',
            description: 'Line numbers do not match',
          });
          result.confidence -= 0.05;
        }
      } catch (fileErr) {
        result.discrepancies.push({
          type: 'missing',
          expected: fileToCheck,
          actual: null,
          severity: 'high',
          description: `File not found or cannot be read: ${fileErr instanceof Error ? fileErr.message : String(fileErr)}`,
        });
        result.confidence = 0.2;
      }
    } catch (err) {
      log.error('validation error:', err);
      result.discrepancies.push({
        type: 'missing',
        expected: 'Successful validation',
        actual: err instanceof Error ? err.message : String(err),
        severity: 'high',
        description: 'Validation process failed',
      });
    }

    // Ensure confidence is in valid range
    result.confidence = Math.max(0, Math.min(1, result.confidence));

    log.info(`validation complete: isValid=${result.isValid}, confidence=${result.confidence}`);
    return result;
  },

  /**
   * Batch query for multiple fields
   */
  async batchFieldLineage(
    fields: string[],
    schema?: GraphSchema
  ): Promise<Map<string, { records: Record<string, unknown>[] }>> {
    log.info(`batch querying ${fields.length} fields`);

    const results = new Map<string, { records: Record<string, unknown>[] }>();

    // Use schema-aware query if available
    if (schema) {
      const relevantLabels = new Set<string>();
      fields.forEach(field => {
        const labels = this.findRelevantLabels(field, schema);
        labels.forEach(l => relevantLabels.add(l));
      });

      const labelFilter = Array.from(relevantLabels).map(l => `n:\`${l}\``).join(' OR ');

      const batchQuery = `
        UNWIND $fieldNames as fieldName
        MATCH (n)
        WHERE (${labelFilter})
          AND (n.name = fieldName OR n.field_name = fieldName OR n.column_name = fieldName)
        OPTIONAL MATCH path = (n)-[*1..3]-(related)
        WITH fieldName, n, collect(DISTINCT path) as paths, collect(DISTINCT related) as related
        RETURN fieldName, n, paths, related
        LIMIT 200
      `;

      try {
        const batchResult = await Neo4jMCP.runCypher(batchQuery, { fieldNames: fields });

        // Group by field name
        for (const record of batchResult.records) {
          const fieldName = record.fieldName as string;
          if (!results.has(fieldName)) {
            results.set(fieldName, { records: [] });
          }
          results.get(fieldName)!.records.push(record);
        }
      } catch (err) {
        log.error('batch query failed:', err);
        throw err;
      }
    } else {
      // Fall back to individual queries
      for (const field of fields) {
        try {
          const data = await Neo4jMCP.findFieldLineage({ fieldName: field });
          results.set(field, data);
        } catch (err) {
          log.warn(`failed to query field ${field}:`, err);
          results.set(field, { records: [] });
        }
      }
    }

    log.info(`batch query complete: ${results.size} fields queried`);
    return results;
  },

  /**
   * Find similar fields using fuzzy matching
   */
  async findSimilarFields(
    fieldName: string,
    threshold: number = 0.7
  ): Promise<FieldMatch[]> {
    log.info(`finding similar fields to "${fieldName}" (threshold=${threshold})`);

    // Neo4j doesn't have built-in fuzzy matching, but we can use CONTAINS and pattern matching
    const query = `
      MATCH (n)
      WHERE n.name =~ '(?i).*' + $fieldName + '.*'
         OR n.field_name =~ '(?i).*' + $fieldName + '.*'
         OR n.column_name =~ '(?i).*' + $fieldName + '.*'
      WITH n,
           CASE
             WHEN toLower(coalesce(n.name, n.field_name, n.column_name, '')) = toLower($fieldName) THEN 1.0
             WHEN toLower(coalesce(n.name, n.field_name, n.column_name, '')) CONTAINS toLower($fieldName) THEN 0.8
             ELSE 0.6
           END as similarity,
           labels(n) as nodeLabels,
           properties(n) as props
      WHERE similarity >= $threshold
      RETURN id(n) as nodeId,
             coalesce(n.name, n.field_name, n.column_name) as fieldName,
             similarity,
             nodeLabels,
             props
      ORDER BY similarity DESC
      LIMIT 20
    `;

    try {
      const result = await Neo4jMCP.runCypher(query, { fieldName, threshold });

      const matches: FieldMatch[] = result.records.map((r: any) => ({
        fieldName: r.fieldName as string,
        similarity: r.similarity as number,
        nodeId: String(r.nodeId),
        nodeLabel: (r.nodeLabels as string[])[0] || 'Unknown',
        properties: r.props as Record<string, unknown>,
      }));

      log.info(`found ${matches.length} similar fields`);
      return matches;
    } catch (err) {
      log.error('similar fields search failed:', err);
      throw err;
    }
  },
};
