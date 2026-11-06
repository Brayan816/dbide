// Monaco Editor Setup with Context-Aware MySQL IntelliSense & Autocompletion

let monacoReady = false;
let monacoLoadPromise = null;
let schemaTables = [];  // Array of { name, approx_rows }
let schemaColumnsMap = {}; // { tableName: [ { name, data_type, full_type } ] }
let schemaForeignKeys = []; // Array of { table_name, column_name, ref_table, ref_column, constraint_name }
let fkRelationshipsMap = {}; // Lowercase table -> Array of { targetTable, targetCol, sourceTable, sourceCol, desc, isExplicit }

// MySQL Data Types with rich documentation and snippet placeholders
const MYSQL_DATA_TYPES = [
  { label: 'INT', insertText: 'INT', detail: 'Tipo: Entero estándar de 4 bytes (-2.147.483.648 a 2.147.483.647)', sortText: '01_INT' },
  { label: 'INT AUTO_INCREMENT PRIMARY KEY', insertText: 'INT AUTO_INCREMENT PRIMARY KEY', detail: 'Clave primaria autoincremental entera', sortText: '00_INT_PK' },
  { label: 'VARCHAR', insertText: 'VARCHAR(${1:255})', isSnippet: true, detail: 'Tipo: Cadena de longitud variable (1 a 65.535 caracteres)', sortText: '02_VARCHAR' },
  { label: 'BIGINT', insertText: 'BIGINT', detail: 'Tipo: Entero grande de 8 bytes para IDs masivos', sortText: '03_BIGINT' },
  { label: 'BIGINT AUTO_INCREMENT PRIMARY KEY', insertText: 'BIGINT AUTO_INCREMENT PRIMARY KEY', detail: 'Clave primaria autoincremental de 8 bytes', sortText: '00_BIGINT_PK' },
  { label: 'DECIMAL', insertText: 'DECIMAL(${1:10}, ${2:2})', isSnippet: true, detail: 'Tipo: Numérico exacto con decimales (ideal para precios y dinero)', sortText: '04_DECIMAL' },
  { label: 'DATETIME', insertText: 'DATETIME', detail: 'Tipo: Fecha y hora (formato YYYY-MM-DD HH:MM:SS)', sortText: '05_DATETIME' },
  { label: 'DATE', insertText: 'DATE', detail: 'Tipo: Solo fecha (formato YYYY-MM-DD)', sortText: '06_DATE' },
  { label: 'TIMESTAMP', insertText: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP', isSnippet: true, detail: 'Tipo: Marca temporal automática de servidor', sortText: '07_TIMESTAMP' },
  { label: 'BOOLEAN', insertText: 'BOOLEAN', detail: 'Tipo: Booleano (sinónimo de TINYINT(1) - TRUE/FALSE)', sortText: '08_BOOLEAN' },
  { label: 'TEXT', insertText: 'TEXT', detail: 'Tipo: Texto largo (hasta 65.535 caracteres)', sortText: '09_TEXT' },
  { label: 'MEDIUMTEXT', insertText: 'MEDIUMTEXT', detail: 'Tipo: Texto mediano (hasta 16.7 MB)', sortText: '10_MEDIUMTEXT' },
  { label: 'LONGTEXT', insertText: 'LONGTEXT', detail: 'Tipo: Texto largo (hasta 4 GB)', sortText: '11_LONGTEXT' },
  { label: 'JSON', insertText: 'JSON', detail: 'Tipo: Documento JSON nativo validado por MySQL', sortText: '12_JSON' },
  { label: 'TINYINT', insertText: 'TINYINT', detail: 'Tipo: Entero muy pequeño de 1 byte (-128 a 127)', sortText: '13_TINYINT' },
  { label: 'TINYINT(1)', insertText: 'TINYINT(1)', detail: 'Tipo: Flag binario / Booleano tradicional', sortText: '14_TINYINT1' },
  { label: 'SMALLINT', insertText: 'SMALLINT', detail: 'Tipo: Entero pequeño de 2 bytes (-32.768 a 32.767)', sortText: '15_SMALLINT' },
  { label: 'MEDIUMINT', insertText: 'MEDIUMINT', detail: 'Tipo: Entero mediano de 3 bytes', sortText: '16_MEDIUMINT' },
  { label: 'CHAR', insertText: 'CHAR(${1:10})', isSnippet: true, detail: 'Tipo: Cadena de longitud fija', sortText: '17_CHAR' },
  { label: 'FLOAT', insertText: 'FLOAT', detail: 'Tipo: Número con coma flotante de precisión simple', sortText: '18_FLOAT' },
  { label: 'DOUBLE', insertText: 'DOUBLE', detail: 'Tipo: Número con coma flotante de doble precisión', sortText: '19_DOUBLE' },
  { label: 'TIME', insertText: 'TIME', detail: 'Tipo: Hora (HH:MM:SS)', sortText: '20_TIME' },
  { label: 'YEAR', insertText: 'YEAR', detail: 'Tipo: Año de 4 dígitos', sortText: '21_YEAR' },
  { label: 'BLOB', insertText: 'BLOB', detail: 'Tipo: Datos binarios (hasta 64 KB)', sortText: '22_BLOB' },
  { label: 'MEDIUMBLOB', insertText: 'MEDIUMBLOB', detail: 'Tipo: Datos binarios (hasta 16 MB)', sortText: '23_MEDIUMBLOB' },
  { label: 'LONGBLOB', insertText: 'LONGBLOB', detail: 'Tipo: Datos binarios (hasta 4 GB)', sortText: '24_LONGBLOB' },
  { label: 'ENUM', insertText: "ENUM('${1:activo}', '${2:inactivo}')", isSnippet: true, detail: 'Tipo: Lista cerrada de opciones', sortText: '25_ENUM' }
];

// Column Constraints & Modifiers
const COLUMN_CONSTRAINTS = [
  { label: 'PRIMARY KEY', insertText: 'PRIMARY KEY', detail: 'Restricción: Clave primaria de la tabla' },
  { label: 'AUTO_INCREMENT', insertText: 'AUTO_INCREMENT', detail: 'Modificador: Generar valor autoincremental' },
  { label: 'NOT NULL', insertText: 'NOT NULL', detail: 'Restricción: Campo obligatorio (no permite NULL)' },
  { label: 'NULL', insertText: 'NULL', detail: 'Permite valores nulos' },
  { label: 'DEFAULT', insertText: "DEFAULT '${1:valor}'", isSnippet: true, detail: 'Valor por defecto si no se especifica' },
  { label: 'DEFAULT CURRENT_TIMESTAMP', insertText: 'DEFAULT CURRENT_TIMESTAMP', detail: 'Establecer fecha y hora actual por defecto' },
  { label: 'ON UPDATE CURRENT_TIMESTAMP', insertText: 'ON UPDATE CURRENT_TIMESTAMP', detail: 'Actualizar con la fecha actual al modificar' },
  { label: 'UNIQUE', insertText: 'UNIQUE', detail: 'Restricción: Garantiza valores únicos' },
  { label: 'UNSIGNED', insertText: 'UNSIGNED', detail: 'Solo permite números positivos (duplica el rango positivo)' },
  { label: 'COMMENT', insertText: "COMMENT '${1:descripcion}'", isSnippet: true, detail: 'Comentario explicativo para la columna' },
  { label: 'REFERENCES', insertText: 'REFERENCES ${1:tabla}(${2:columna})', isSnippet: true, detail: 'Referencia de clave foránea' },
  { label: 'CHECK', insertText: 'CHECK (${1:condicion})', isSnippet: true, detail: 'Restricción de validación' }
];

// Table Level Constraints & Options
const TABLE_LEVEL_CONSTRAINTS = [
  { label: 'PRIMARY KEY', insertText: 'PRIMARY KEY (${1:id})', isSnippet: true, detail: 'Definir clave primaria' },
  { label: 'FOREIGN KEY', insertText: 'FOREIGN KEY (${1:columna_fk}) REFERENCES ${2:tabla_ref}(${3:id})', isSnippet: true, detail: 'Definir clave foránea' },
  { label: 'CONSTRAINT', insertText: 'CONSTRAINT ${1:fk_nombre} FOREIGN KEY (${2:columna}) REFERENCES ${3:tabla}(${4:id})', isSnippet: true, detail: 'Restricción nombrada' },
  { label: 'INDEX', insertText: 'INDEX ${1:idx_nombre} (${2:columna})', isSnippet: true, detail: 'Índice de búsqueda' },
  { label: 'UNIQUE KEY', insertText: 'UNIQUE KEY ${1:uk_nombre} (${2:columna})', isSnippet: true, detail: 'Índice único' }
];

// Standard SQL Keywords
const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'LIKE', 'IS NULL', 'IS NOT NULL',
  'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'JOIN', 'INNER JOIN',
  'LEFT JOIN', 'RIGHT JOIN', 'CROSS JOIN', 'STRAIGHT_JOIN', 'NATURAL JOIN', 'LATERAL', 'LEFT JOIN LATERAL',
  'ON', 'USING', 'GROUP BY', 'HAVING', 'ORDER BY',
  'ASC', 'DESC', 'LIMIT', 'OFFSET', 'UNION', 'UNION ALL', 'DISTINCT', 'AS',
  'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'TRUNCATE TABLE',
  'CREATE PROCEDURE', 'DROP PROCEDURE', 'CALL', 'CREATE FUNCTION', 'DROP FUNCTION',
  'CREATE VIEW', 'DROP VIEW', 'CREATE TRIGGER', 'DROP TRIGGER',
  'SHOW DATABASES', 'SHOW TABLES', 'SHOW CREATE TABLE', 'DESCRIBE', 'EXPLAIN',
  'BEGIN', 'COMMIT', 'ROLLBACK', 'DECLARE', 'IF', 'THEN', 'ELSE', 'END IF', 'WHILE', 'LOOP'
];

// SQL Functions
const SQL_FUNCTIONS = [
  { label: 'COUNT', insertText: 'COUNT(${1:*})', isSnippet: true, detail: 'Cuenta el número de filas' },
  { label: 'SUM', insertText: 'SUM(${1:columna})', isSnippet: true, detail: 'Suma los valores de una columna' },
  { label: 'AVG', insertText: 'AVG(${1:columna})', isSnippet: true, detail: 'Promedio de valores' },
  { label: 'MIN', insertText: 'MIN(${1:columna})', isSnippet: true, detail: 'Valor mínimo' },
  { label: 'MAX', insertText: 'MAX(${1:columna})', isSnippet: true, detail: 'Valor máximo' },
  { label: 'CONCAT', insertText: 'CONCAT(${1:str1}, ${2:str2})', isSnippet: true, detail: 'Concatena cadenas' },
  { label: 'COALESCE', insertText: 'COALESCE(${1:val1}, ${2:val2})', isSnippet: true, detail: 'Retorna el primer valor no nulo' },
  { label: 'IFNULL', insertText: 'IFNULL(${1:val}, ${2:sustituto})', isSnippet: true, detail: 'Reemplaza si es NULL' },
  { label: 'NOW', insertText: 'NOW()', isSnippet: false, detail: 'Fecha y hora actual' },
  { label: 'CURDATE', insertText: 'CURDATE()', isSnippet: false, detail: 'Fecha actual' },
  { label: 'DATE_FORMAT', insertText: "DATE_FORMAT(${1:fecha}, '%Y-%m-%d')", isSnippet: true, detail: 'Formatea una fecha' },
  { label: 'DATEDIFF', insertText: 'DATEDIFF(${1:fecha1}, ${2:fecha2})', isSnippet: true, detail: 'Diferencia en días entre fechas' },
  { label: 'LOWER', insertText: 'LOWER(${1:cadena})', isSnippet: true, detail: 'Convierte a minúsculas' },
  { label: 'UPPER', insertText: 'UPPER(${1:cadena})', isSnippet: true, detail: 'Convierte a mayúsculas' },
  { label: 'TRIM', insertText: 'TRIM(${1:cadena})', isSnippet: true, detail: 'Elimina espacios en extremos' },
  { label: 'JSON_EXTRACT', insertText: "JSON_EXTRACT(${1:columna}, '$.${2:campo}')", isSnippet: true, detail: 'Extrae un valor de documento JSON' },
  { label: 'ROUND', insertText: 'ROUND(${1:numero}, ${2:2})', isSnippet: true, detail: 'Redondea un número decimal' }
];

// Helper: Check if cursor is inside the parentheses of CREATE TABLE (...)
function isInsideCreateTable(fullText) {
  const matches = [...fullText.matchAll(/CREATE\s+(?:TEMPORARY\s+)?TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+[^\(]+\(/gi)];
  if (!matches.length) return false;
  const lastMatch = matches[matches.length - 1];
  const sliceAfterParen = fullText.slice(lastMatch.index + lastMatch[0].length);

  let depth = 1;
  for (const ch of sliceAfterParen) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
  }
  return depth > 0;
}

// Build relationship lookup map (both explicit InnoDB foreign keys and convention-based)
function buildForeignKeyGraph() {
  fkRelationshipsMap = {};

  const addRel = (srcTable, rel) => {
    const k = (srcTable || '').toLowerCase().trim();
    if (!k) return;
    if (!fkRelationshipsMap[k]) {
      fkRelationshipsMap[k] = [];
    }
    const exists = fkRelationshipsMap[k].some(r => 
      r.targetTable.toLowerCase() === rel.targetTable.toLowerCase() &&
      r.targetCol.toLowerCase() === rel.targetCol.toLowerCase() &&
      r.sourceCol.toLowerCase() === rel.sourceCol.toLowerCase()
    );
    if (!exists) {
      fkRelationshipsMap[k].push(rel);
    }
  };

  // 1. Explicit MySQL Foreign Keys from information_schema
  schemaForeignKeys.forEach(fk => {
    const childTable = (fk.table_name || '').trim();
    const childCol = (fk.column_name || '').trim();
    const parentTable = (fk.ref_table || '').trim();
    const parentCol = (fk.ref_column || '').trim();

    if (!childTable || !parentTable || !childCol || !parentCol) return;

    // Direction 1: If childTable is in query, target is parentTable
    addRel(childTable, {
      targetTable: parentTable,
      targetCol: parentCol,
      sourceTable: childTable,
      sourceCol: childCol,
      isExplicit: true,
      desc: `${childTable}.${childCol} → ${parentTable}.${parentCol}`
    });

    // Direction 2: If parentTable is in query, target is childTable
    addRel(parentTable, {
      targetTable: childTable,
      targetCol: childCol,
      sourceTable: parentTable,
      sourceCol: parentCol,
      isExplicit: true,
      desc: `${childTable}.${childCol} → ${parentTable}.${parentCol}`
    });
  });

  // 2. Convention-based / Heuristic Foreign Keys ([table]_id <-> id)
  const tableNames = Object.keys(schemaColumnsMap);
  tableNames.forEach(t1 => {
    const cols1 = (schemaColumnsMap[t1] || []).map(c => c.name.toLowerCase());
    tableNames.forEach(t2 => {
      if (t1.toLowerCase() === t2.toLowerCase()) return;
      const cols2 = (schemaColumnsMap[t2] || []).map(c => c.name.toLowerCase());

      const t2Clean = t2.toLowerCase().replace(/[`]/g, '');
      const t2Singular = t2Clean.endsWith('es') 
        ? t2Clean.slice(0, -2) 
        : (t2Clean.endsWith('s') ? t2Clean.slice(0, -1) : t2Clean);

      const candidateFkCols = [
        `${t2Clean}_id`,
        `${t2Singular}_id`,
        `id_${t2Clean}`,
        `id_${t2Singular}`
      ];

      for (const fkCandidate of candidateFkCols) {
        if (cols1.includes(fkCandidate) && (cols2.includes('id') || cols2.includes(`id_${t2Clean}`))) {
          const pkCol = cols2.includes('id') ? 'id' : `id_${t2Clean}`;

          // Direction A: t1 has FK to t2
          addRel(t1, {
            targetTable: t2,
            targetCol: pkCol,
            sourceTable: t1,
            sourceCol: fkCandidate,
            isExplicit: false,
            desc: `${t1}.${fkCandidate} → ${t2}.${pkCol}`
          });

          // Direction B: t2 has child t1
          addRel(t2, {
            targetTable: t1,
            targetCol: fkCandidate,
            sourceTable: t2,
            sourceCol: pkCol,
            isExplicit: false,
            desc: `${t1}.${fkCandidate} → ${t2}.${pkCol}`
          });
          break;
        }
      }
    });
  });
}

function getRelationshipsForTable(tableName) {
  if (!tableName) return [];
  const k = tableName.toLowerCase().trim();
  return fkRelationshipsMap[k] || [];
}

// Parse JOIN context: extract immediately preceding table and other present tables
function parseJoinContext(fullTextBefore) {
  if (!fullTextBefore) return null;

  const cleaned = fullTextBefore
    .replace(/--[^\r\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, ' ')
    .replace(/"(?:[^"\\]|\\.)*"/g, ' ');

  const stmts = cleaned.split(';');
  const lastStmt = stmts[stmts.length - 1];

  const joinMatch = lastStmt.match(/\b(?:INNER\s+|LEFT\s+|RIGHT\s+|FULL\s+|CROSS\s+|STRAIGHT_)?(?:OUTER\s+)?JOIN(?:\s+LATERAL)?\s+([`\w]*)$/i);
  if (!joinMatch) return null;

  const prefix = joinMatch[1].replace(/[`]/g, '');
  const textBeforeJoin = lastStmt.slice(0, joinMatch.index);
  const tables = [];

  // 1. FROM clause
  const fromMatch = textBeforeJoin.match(/\bFROM\s+([`\w]+)(?:\s+(?:AS\s+)?([`\w]+))?/i);
  if (fromMatch) {
    const tName = fromMatch[1].replace(/[`]/g, '');
    let tAlias = fromMatch[2] ? fromMatch[2].replace(/[`]/g, '') : null;
    if (tAlias && ['WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'ON', 'GROUP', 'ORDER', 'LIMIT', 'SET', 'VALUES'].includes(tAlias.toUpperCase())) {
      tAlias = null;
    }
    tables.push({ name: tName, alias: tAlias || tName });
  }

  // 2. Preceding JOIN clauses
  const joinRegex = /\b(?:INNER\s+|LEFT\s+|RIGHT\s+|FULL\s+|CROSS\s+|STRAIGHT_)?(?:OUTER\s+)?JOIN\s+([`\w]+)(?:\s+(?:AS\s+)?([`\w]+))?/gi;
  let jm;
  while ((jm = joinRegex.exec(textBeforeJoin)) !== null) {
    const tName = jm[1].replace(/[`]/g, '');
    let tAlias = jm[2] ? jm[2].replace(/[`]/g, '') : null;
    if (tAlias && ['WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'ON', 'GROUP', 'ORDER', 'LIMIT', 'SET', 'VALUES'].includes(tAlias.toUpperCase())) {
      tAlias = null;
    }
    tables.push({ name: tName, alias: tAlias || tName });
  }

  const prevTable = tables.length > 0 ? tables[tables.length - 1] : null;
  const otherTables = tables.length > 1 ? tables.slice(0, tables.length - 1) : [];

  return {
    prefix,
    allTables: tables,
    prevTable,
    otherTables
  };
}

// Parse ON context: check which table is being joined and suggest exact FK equality
function parseOnContext(fullTextBefore) {
  if (!fullTextBefore) return null;

  const cleaned = fullTextBefore
    .replace(/--[^\r\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, ' ')
    .replace(/"(?:[^"\\]|\\.)*"/g, ' ');

  const stmts = cleaned.split(';');
  const lastStmt = stmts[stmts.length - 1];

  const onMatch = lastStmt.match(/\bON\s+([`\w]*)$/i);
  if (!onMatch) return null;

  const prefix = onMatch[1].replace(/[`]/g, '');
  const textBeforeOn = lastStmt.slice(0, onMatch.index);

  const joinTargetMatch = textBeforeOn.match(/\b(?:INNER\s+|LEFT\s+|RIGHT\s+|FULL\s+|CROSS\s+|STRAIGHT_)?(?:OUTER\s+)?JOIN\s+([`\w]+)(?:\s+(?:AS\s+)?([`\w]+))?\s*$/i);
  if (!joinTargetMatch) return null;

  const currentTable = joinTargetMatch[1].replace(/[`]/g, '');
  let currentAlias = joinTargetMatch[2] ? joinTargetMatch[2].replace(/[`]/g, '') : null;
  if (currentAlias && ['WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'ON', 'GROUP', 'ORDER', 'LIMIT', 'SET', 'VALUES'].includes(currentAlias.toUpperCase())) {
    currentAlias = null;
  }

  const textBeforeJoin = textBeforeOn.slice(0, joinTargetMatch.index);
  const tables = [];

  const fromMatch = textBeforeJoin.match(/\bFROM\s+([`\w]+)(?:\s+(?:AS\s+)?([`\w]+))?/i);
  if (fromMatch) {
    const tName = fromMatch[1].replace(/[`]/g, '');
    let tAlias = fromMatch[2] ? fromMatch[2].replace(/[`]/g, '') : null;
    if (tAlias && ['WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'ON', 'GROUP', 'ORDER', 'LIMIT', 'SET', 'VALUES'].includes(tAlias.toUpperCase())) {
      tAlias = null;
    }
    tables.push({ name: tName, alias: tAlias || tName });
  }

  const joinRegex = /\b(?:INNER\s+|LEFT\s+|RIGHT\s+|FULL\s+|CROSS\s+|STRAIGHT_)?(?:OUTER\s+)?JOIN\s+([`\w]+)(?:\s+(?:AS\s+)?([`\w]+))?/gi;
  let jm;
  while ((jm = joinRegex.exec(textBeforeJoin)) !== null) {
    const tName = jm[1].replace(/[`]/g, '');
    let tAlias = jm[2] ? jm[2].replace(/[`]/g, '') : null;
    if (tAlias && ['WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'ON', 'GROUP', 'ORDER', 'LIMIT', 'SET', 'VALUES'].includes(tAlias.toUpperCase())) {
      tAlias = null;
    }
    tables.push({ name: tName, alias: tAlias || tName });
  }

  return {
    prefix,
    currentTable: { name: currentTable, alias: currentAlias || currentTable },
    prevTables: tables
  };
}

// Generate smart, conventional table aliases (e.g. order_items -> oi, users -> u, clientes -> c)
function generateTableAlias(tableName, existingAliases = new Set()) {
  if (!tableName) return 't';
  const clean = tableName.replace(/[`]/g, '').trim();
  if (!clean) return 't';

  let candidate = '';
  if (clean.includes('_')) {
    // snake_case: take first letter of each word
    candidate = clean.split('_').filter(Boolean).map(p => p[0].toLowerCase()).join('');
  } else if (/[A-Z]/.test(clean.slice(1))) {
    // camelCase / PascalCase
    candidate = clean.split(/(?=[A-Z])/).filter(Boolean).map(p => p[0].toLowerCase()).join('');
  } else {
    // single word: take first letter
    candidate = clean[0].toLowerCase();
  }

  const reserved = new Set(['as', 'on', 'in', 'is', 'by', 'to', 'or', 'do', 'if']);
  if (reserved.has(candidate) || !candidate) {
    candidate = clean.slice(0, 2).toLowerCase();
  }

  // Avoid collision with already used aliases in query
  if (existingAliases && existingAliases.has(candidate)) {
    const twoLetter = clean.slice(0, 2).toLowerCase();
    if (!existingAliases.has(twoLetter) && !reserved.has(twoLetter)) {
      candidate = twoLetter;
    } else {
      let num = 2;
      while (existingAliases.has(`${candidate}${num}`)) {
        num++;
      }
      candidate = `${candidate}${num}`;
    }
  }

  return candidate;
}

// Parse alias context: check if cursor is right after a table name in FROM or JOIN
function parseAliasContext(fullTextBefore) {
  if (!fullTextBefore) return null;

  const cleaned = fullTextBefore
    .replace(/--[^\r\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, ' ')
    .replace(/"(?:[^"\\]|\\.)*"/g, ' ');

  const stmts = cleaned.split(';');
  const lastStmt = stmts[stmts.length - 1];

  const m = lastStmt.match(/\b(?:FROM|(?:(?:INNER\s+|LEFT\s+|RIGHT\s+|FULL\s+|CROSS\s+|STRAIGHT_)?(?:OUTER\s+)?JOIN))\s+([`\w]+)\s+([`\w]*)$/i);
  if (!m) return null;

  const tbl = m[1].replace(/[`]/g, '');
  const prefix = m[2].replace(/[`]/g, '');

  if (['WHERE', 'ON', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'GROUP', 'ORDER', 'LIMIT', 'HAVING', 'SET', 'VALUES'].includes(prefix.toUpperCase())) {
    return null;
  }

  // Collect already used aliases in text before this table
  const textBefore = lastStmt.slice(0, m.index);
  const existingAliases = new Set();
  const aliasRegex = /\b(?:FROM|JOIN)\s+[`\w]+\s+(?:AS\s+)?([`\w]+)/gi;
  let am;
  while ((am = aliasRegex.exec(textBefore)) !== null) {
    const al = am[1].toLowerCase();
    if (!['where', 'join', 'inner', 'left', 'right', 'on', 'group', 'order'].includes(al)) {
      existingAliases.add(al);
    }
  }

  return {
    table: tbl,
    prefix,
    existingAliases
  };
}

// Extract all tables and aliases from a statement or full document
function extractQueryTableAliases(text) {
  if (!text) return [];
  const cleaned = text
    .replace(/--[^\r\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, ' ')
    .replace(/"(?:[^"\\]|\\.)*"/g, ' ');

  const tables = [];
  const seen = new Set();

  const fromMatch = cleaned.match(/\bFROM\s+([`\w]+)(?:\s+(?:AS\s+)?([`\w]+))?/i);
  if (fromMatch) {
    const tName = fromMatch[1].replace(/[`]/g, '');
    let tAlias = fromMatch[2] ? fromMatch[2].replace(/[`]/g, '') : null;
    if (tAlias && ['WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'ON', 'GROUP', 'ORDER', 'LIMIT', 'SET', 'VALUES'].includes(tAlias.toUpperCase())) {
      tAlias = null;
    }
    const finalAlias = tAlias || generateTableAlias(tName);
    tables.push({ name: tName, alias: finalAlias, explicitAlias: !!tAlias });
    seen.add(tName.toLowerCase());
  }

  const joinRegex = /\b(?:INNER\s+|LEFT\s+|RIGHT\s+|FULL\s+|CROSS\s+|STRAIGHT_)?(?:OUTER\s+)?JOIN\s+([`\w]+)(?:\s+(?:AS\s+)?([`\w]+))?/gi;
  let jm;
  while ((jm = joinRegex.exec(cleaned)) !== null) {
    const tName = jm[1].replace(/[`]/g, '');
    let tAlias = jm[2] ? jm[2].replace(/[`]/g, '') : null;
    if (tAlias && ['WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'ON', 'GROUP', 'ORDER', 'LIMIT', 'SET', 'VALUES'].includes(tAlias.toUpperCase())) {
      tAlias = null;
    }
    const existing = new Set(tables.map(t => t.alias.toLowerCase()));
    const finalAlias = tAlias || generateTableAlias(tName, existing);
    tables.push({ name: tName, alias: finalAlias, explicitAlias: !!tAlias });
    seen.add(tName.toLowerCase());
  }

  return tables;
}

// Load Monaco from CDN
function initMonacoLoader() {
  if (monacoLoadPromise) return monacoLoadPromise;

  monacoLoadPromise = new Promise((resolve) => {
    if (window.monaco) {
      monacoReady = true;
      return resolve(window.monaco);
    }

    if (window.require) {
      window.require.config({
        paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }
      });

      window.require(['vs/editor/editor.main'], function () {
        monacoReady = true;

        // Enhance SQL syntax highlighting: Make sure JOIN keywords (INNER, JOIN, LEFT, RIGHT, etc.)
        // and LATERAL are classified as keywords (BLUE #569cd6) instead of operators (WHITE #d4d4d4)
        try {
          window.require(['vs/basic-languages/sql/sql'], function (sqlModule) {
            if (sqlModule && sqlModule.language) {
              const joinKeywords = [
                'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'OUTER', 
                'NATURAL', 'STRAIGHT_JOIN', 'LATERAL', 'APPLY', 'UNION', 'INTERSECT', 'EXCEPT'
              ];

              // 1. Remove JOIN words from operators array so Monaco doesn't tokenize them as "operator" (which renders white)
              if (Array.isArray(sqlModule.language.operators)) {
                sqlModule.language.operators = sqlModule.language.operators.filter(
                  op => !joinKeywords.includes(op.toUpperCase())
                );
              }

              // 2. Ensure all JOIN words and LATERAL are in the keywords array so they tokenize as "keyword" (BLUE)
              if (Array.isArray(sqlModule.language.keywords)) {
                const allBlueKeywords = [
                  'LATERAL', 'STRAIGHT_JOIN', 'NATURAL', 'CROSS', 'OUTER', 
                  'INNER', 'JOIN', 'LEFT', 'RIGHT', 'FULL', 'ON', 'USING',
                  'WINDOW', 'OVER', 'PARTITION', 'QUALIFY', 'RECURSIVE', 'APPLY'
                ];
                allBlueKeywords.forEach(kw => {
                  if (!sqlModule.language.keywords.includes(kw)) {
                    sqlModule.language.keywords.push(kw);
                  }
                  const lower = kw.toLowerCase();
                  if (!sqlModule.language.keywords.includes(lower)) {
                    sqlModule.language.keywords.push(lower);
                  }
                });
              }

              // 3. Re-register the updated Monarch Token Provider for SQL
              monaco.languages.setMonarchTokensProvider('sql', sqlModule.language);
            }
          });
        } catch (e) {
          console.warn('Error enhancing SQL tokenizer:', e);
        }

        // Define custom dark theme with explicit blue (#569cd6) for SQL keywords
        try {
          monaco.editor.defineTheme('mysql-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
              { token: 'keyword', foreground: '569cd6', fontStyle: 'bold' },
              { token: 'keyword.sql', foreground: '569cd6', fontStyle: 'bold' },
              { token: 'operator.sql', foreground: 'd4d4d4' },
              { token: 'string.sql', foreground: 'ce9178' },
              { token: 'number.sql', foreground: 'b5cea8' },
              { token: 'comment.sql', foreground: '6a9955', fontStyle: 'italic' },
              { token: 'predefined.sql', foreground: '4ec9b0' }
            ],
            colors: {
              'editor.background': '#1e1e1e',
              'editor.foreground': '#d4d4d4'
            }
          });
        } catch (e) {
          console.warn('Error defining theme:', e);
        }

        registerSqlCompletions();
        registerSqlHoverProvider();
        resolve(window.monaco);
      });
    } else {
      console.warn("Monaco loader not found, falling back to textarea editor.");
      resolve(null);
    }
  });

  return monacoLoadPromise;
}

// Register custom SQL Autocomplete Suggestions with Context Awareness
function registerSqlCompletions() {
  if (!window.monaco) return;

  monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: [' ', '.', '(', ',', '`'],
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };

      const fullTextBefore = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      });

      const lineUntilCursor = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      });

      const trimmedLine = lineUntilCursor.trim();
      const suggestions = [];

      // =========================================================================
      // CONTEXT 1: INSIDE CREATE TABLE (...) DEFINITION
      // =========================================================================
      if (isInsideCreateTable(fullTextBefore)) {
        const tokens = trimmedLine.split(/\s+/).filter(Boolean);

        // Check if current line starts with table-level constraint keywords
        const firstTokenUpper = (tokens[0] || '').replace(/[`]/g, '').toUpperCase();
        const isTableConstraintKeyword = ['PRIMARY', 'FOREIGN', 'CONSTRAINT', 'INDEX', 'KEY', 'UNIQUE', 'CHECK'].includes(firstTokenUpper);

        // Case A: User has typed a column name and is now typing the DATA TYPE (e.g., "ID int", "nombre var")
        // tokens.length === 2 (ColumnName, TypePrefix) OR tokens.length === 1 with trailing space ("ID ")
        const isTypingDataType = !isTableConstraintKeyword && (
          (tokens.length === 2) ||
          (tokens.length === 1 && lineUntilCursor.endsWith(' '))
        );

        if (isTypingDataType) {
          // Provide ONLY Data Types with top priority!
          MYSQL_DATA_TYPES.forEach(item => {
            suggestions.push({
              label: item.label,
              kind: monaco.languages.CompletionItemKind.TypeParameter,
              insertText: item.insertText,
              insertTextRules: item.isSnippet ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
              range: range,
              detail: item.detail,
              sortText: item.sortText || ('00_' + item.label)
            });
          });
          return { suggestions };
        }

        // Case B: User already typed Column Name and Data Type (e.g., "ID INT ", "nombre VARCHAR(255) ")
        // Now typing column constraints/modifiers (PRIMARY KEY, AUTO_INCREMENT, NOT NULL, DEFAULT, etc.)
        const hasKnownType = /\b(INT|BIGINT|TINYINT|SMALLINT|MEDIUMINT|VARCHAR|CHAR|TEXT|MEDIUMTEXT|LONGTEXT|DECIMAL|NUMERIC|FLOAT|DOUBLE|DATE|DATETIME|TIMESTAMP|TIME|YEAR|BOOLEAN|JSON|BLOB|ENUM)\b/i.test(trimmedLine);
        
        if (!isTableConstraintKeyword && hasKnownType) {
          COLUMN_CONSTRAINTS.forEach((item, idx) => {
            suggestions.push({
              label: item.label,
              kind: monaco.languages.CompletionItemKind.Keyword,
              insertText: item.insertText,
              insertTextRules: item.isSnippet ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
              range: range,
              detail: item.detail,
              sortText: `00_${String(idx).padStart(2, '0')}_${item.label}`
            });
          });
          return { suggestions };
        }

        // Case C: Start of a new line in CREATE TABLE (suggest table constraints or snippets)
        if (tokens.length <= 1) {
          TABLE_LEVEL_CONSTRAINTS.forEach(item => {
            suggestions.push({
              label: item.label,
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: item.insertText,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range: range,
              detail: item.detail,
              sortText: '05_' + item.label
            });
          });

          // Also suggest common column starter snippet
          suggestions.push({
            label: 'id INT AUTO_INCREMENT PRIMARY KEY',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: 'id INT AUTO_INCREMENT PRIMARY KEY,',
            range: range,
            detail: 'Plantilla de columna ID primaria autoincremental',
            sortText: '00_id_pk'
          });
          return { suggestions };
        }
      }

      // =========================================================================
      // CONTEXT: AFTER DOT "." (e.g. u. or c. or users.) -> COLUMNS OF QUALIFIED TABLE/ALIAS
      // =========================================================================
      const dotMatch = lineUntilCursor.match(/([`\w]+)\.([`\w]*)$/);
      if (dotMatch) {
        const qualifier = dotMatch[1].replace(/[`]/g, '');
        let targetTableName = null;
        const fullDocText = model.getValue();
        const queryTables = extractQueryTableAliases(fullDocText);
        const aliasMatch = queryTables.find(t => t.alias.toLowerCase() === qualifier.toLowerCase());
        if (aliasMatch) {
          targetTableName = aliasMatch.name;
        } else {
          const directMatch = schemaTables.find(t => t.name.toLowerCase() === qualifier.toLowerCase());
          if (directMatch) targetTableName = directMatch.name;
        }

        if (targetTableName) {
          const cols = schemaColumnsMap[targetTableName] || [];
          cols.forEach(c => {
            suggestions.push({
              label: c.name,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: c.name,
              range: range,
              detail: `${c.full_type || c.data_type} • ${targetTableName} (${qualifier})`,
              sortText: '00_' + c.name
            });
          });

          suggestions.push({
            label: '*',
            kind: monaco.languages.CompletionItemKind.Operator,
            insertText: '*',
            range: range,
            detail: `Todas las columnas de ${targetTableName} (${qualifier}.*)`,
            sortText: '0000_*'
          });

          return { suggestions };
        }
      }

      // =========================================================================
      // CONTEXT: RIGHT AFTER TABLE NAME IN FROM OR JOIN -> SUGGEST TABLE ALIAS
      // =========================================================================
      const aliasCtx = parseAliasContext(fullTextBefore);
      if (aliasCtx) {
        const autoAlias = generateTableAlias(aliasCtx.table, aliasCtx.existingAliases);
        suggestions.push({
          label: autoAlias,
          filterText: autoAlias,
          kind: monaco.languages.CompletionItemKind.Variable,
          insertText: autoAlias + ' ',
          range: range,
          detail: `⚡ Alias sugerido para ${aliasCtx.table}`,
          documentation: {
            value: `Asignar alias corto **${autoAlias}** a la tabla **${aliasCtx.table}**`
          },
          sortText: '0000_A_' + autoAlias
        });

        suggestions.push({
          label: `AS ${autoAlias}`,
          filterText: `AS ${autoAlias}`,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: `AS ${autoAlias} `,
          range: range,
          detail: `⚡ Alias explícito: AS ${autoAlias}`,
          sortText: '0000_B_AS_' + autoAlias
        });

        // Useful clauses to continue writing if user skips alias
        ['WHERE', 'JOIN', 'INNER JOIN', 'LEFT JOIN', 'ON', 'ORDER BY', 'GROUP BY'].forEach(kw => {
          suggestions.push({
            label: kw,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: kw + ' ',
            range: range,
            detail: 'Cláusula SQL',
            sortText: '0010_' + kw
          });
        });

        return { suggestions };
      }

      // =========================================================================
      // CONTEXT 2: AFTER "JOIN" -> SUGGEST TABLES CONNECTED BY FOREIGN KEYS
      // Giving top priority to tables connected with the immediately preceding table
      // =========================================================================
      const joinCtx = parseJoinContext(fullTextBefore);
      if (joinCtx) {
        const suggestedTables = new Set();
        let prioIndex = 0;
        const existingAliases = new Set(joinCtx.allTables.map(t => t.alias.toLowerCase()));

        // PRIORITY 1: Tables connected directly with the immediately preceding table (prevTable)
        if (joinCtx.prevTable) {
          const rels = getRelationshipsForTable(joinCtx.prevTable.name);
          rels.forEach(rel => {
            suggestedTables.add(rel.targetTable.toLowerCase());
            const seq = String(prioIndex++).padStart(2, '0');
            const targetAlias = generateTableAlias(rel.targetTable, existingAliases);
            const onCondWithAlias = `${targetAlias}.${rel.targetCol} = ${joinCtx.prevTable.alias}.${rel.sourceCol}`;

            // 1.A: Smart Join Snippet with table alias and ON clause pre-filled
            suggestions.push({
              label: `${rel.targetTable} ${targetAlias} ON ${onCondWithAlias}`,
              filterText: `${rel.targetTable} ${targetAlias} ${rel.targetCol}`,
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: `${rel.targetTable} ${targetAlias} ON ${onCondWithAlias}`,
              range: range,
              detail: `⚡ FK con ${joinCtx.prevTable.name} (${joinCtx.prevTable.alias}) • Con alias (${targetAlias})`,
              documentation: {
                value: `**Relación de Clave Foránea con Alias (Prioridad Inmediata)**\n\nConectada directamente con la tabla previa **${joinCtx.prevTable.name}** (\`${joinCtx.prevTable.alias}\`):\n\`\`\`sql\nJOIN ${rel.targetTable} ${targetAlias} ON ${onCondWithAlias}\n\`\`\``
              },
              sortText: `0000_A_${seq}_${rel.targetTable}`
            });

            // 1.B: Table name + alias (e.g. "pedidos p")
            suggestions.push({
              label: `${rel.targetTable} ${targetAlias}`,
              filterText: `${rel.targetTable} ${targetAlias}`,
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: `${rel.targetTable} ${targetAlias}`,
              range: range,
              detail: `⚡ FK directa con ${joinCtx.prevTable.name} • Alias: ${targetAlias}`,
              documentation: {
                value: `Inserta la tabla con su alias asignado automáticamente:\n\`\`\`sql\n${rel.targetTable} ${targetAlias}\n\`\`\``
              },
              sortText: `0000_B_${seq}_${rel.targetTable}`
            });

            // 1.C: Table name alone -> ALSO inserts table + alias
            suggestions.push({
              label: rel.targetTable,
              filterText: rel.targetTable,
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: `${rel.targetTable} ${targetAlias}`,
              range: range,
              detail: `⚡ FK directa con ${joinCtx.prevTable.name} • Inserta: ${rel.targetTable} ${targetAlias}`,
              documentation: {
                value: `Inserta la tabla con su alias asignado automáticamente:\n\`\`\`sql\n${rel.targetTable} ${targetAlias}\n\`\`\``
              },
              sortText: `0000_C_${seq}_${rel.targetTable}`
            });
          });
        }

        // PRIORITY 2: Tables connected with other tables already present in query
        let otherPrioIndex = 0;
        joinCtx.otherTables.forEach(otherTable => {
          const rels = getRelationshipsForTable(otherTable.name);
          rels.forEach(rel => {
            if (suggestedTables.has(rel.targetTable.toLowerCase())) return;
            suggestedTables.add(rel.targetTable.toLowerCase());

            const seq = String(otherPrioIndex++).padStart(2, '0');
            const targetAlias = generateTableAlias(rel.targetTable, existingAliases);
            const onCondWithAlias = `${targetAlias}.${rel.targetCol} = ${otherTable.alias}.${rel.sourceCol}`;

            // 2.A: Smart Join Snippet with table alias and ON clause
            suggestions.push({
              label: `${rel.targetTable} ${targetAlias} ON ${onCondWithAlias}`,
              filterText: `${rel.targetTable} ${targetAlias} ${rel.targetCol}`,
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: `${rel.targetTable} ${targetAlias} ON ${onCondWithAlias}`,
              range: range,
              detail: `🔗 FK con ${otherTable.name} (${otherTable.alias}) • Con alias (${targetAlias})`,
              documentation: {
                value: `**Relación de Clave Foránea con Alias**\n\nConectada con la tabla presente **${otherTable.name}** (\`${otherTable.alias}\`):\n\`\`\`sql\nJOIN ${rel.targetTable} ${targetAlias} ON ${onCondWithAlias}\n\`\`\``
              },
              sortText: `0001_A_${seq}_${rel.targetTable}`
            });

            // 2.B: Table name + alias
            suggestions.push({
              label: `${rel.targetTable} ${targetAlias}`,
              filterText: `${rel.targetTable} ${targetAlias}`,
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: `${rel.targetTable} ${targetAlias}`,
              range: range,
              detail: `🔗 FK con ${otherTable.name} • Alias: ${targetAlias}`,
              documentation: {
                value: `Inserta la tabla con su alias asignado automáticamente:\n\`\`\`sql\n${rel.targetTable} ${targetAlias}\n\`\`\``
              },
              sortText: `0001_B_${seq}_${rel.targetTable}`
            });

            // 2.C: Table name alone -> ALSO inserts table + alias
            suggestions.push({
              label: rel.targetTable,
              filterText: rel.targetTable,
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: `${rel.targetTable} ${targetAlias}`,
              range: range,
              detail: `🔗 FK con ${otherTable.name} • Inserta: ${rel.targetTable} ${targetAlias}`,
              documentation: {
                value: `Inserta la tabla con su alias asignado automáticamente:\n\`\`\`sql\n${rel.targetTable} ${targetAlias}\n\`\`\``
              },
              sortText: `0001_C_${seq}_${rel.targetTable}`
            });
          });
        });

        // PRIORITY 3: All other tables in DB (not directly connected to present tables)
        schemaTables.forEach(t => {
          if (!suggestedTables.has(t.name.toLowerCase())) {
            const alias = generateTableAlias(t.name, existingAliases);
            // 3.A: Table name + alias
            suggestions.push({
              label: `${t.name} ${alias}`,
              filterText: `${t.name} ${alias}`,
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: `${t.name} ${alias}`,
              range: range,
              detail: `Tabla (${t.approx_rows ?? 0} filas aprox) • Alias: ${alias}`,
              documentation: {
                value: `Inserta la tabla con su alias asignado automáticamente:\n\`\`\`sql\n${t.name} ${alias}\n\`\`\``
              },
              sortText: `0010_A_${t.name}`
            });

            // 3.B: Table name alone -> ALSO inserts table + alias
            suggestions.push({
              label: t.name,
              filterText: t.name,
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: `${t.name} ${alias}`,
              range: range,
              detail: `Tabla (${t.approx_rows ?? 0} filas aprox) • Inserta: ${t.name} ${alias}`,
              documentation: {
                value: `Inserta la tabla con su alias asignado automáticamente:\n\`\`\`sql\n${t.name} ${alias}\n\`\`\``
              },
              sortText: `0010_B_${t.name}`
            });

            // 3.C: Table without alias
            suggestions.push({
              label: `${t.name} (sin alias)`,
              filterText: `${t.name} sin alias`,
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: t.name,
              range: range,
              detail: `Solo nombre de tabla (${t.approx_rows ?? 0} filas aprox)`,
              sortText: `0010_Z_${t.name}`
            });
          }
        });

        return { suggestions };
      }

      // =========================================================================
      // CONTEXT 2.B: AFTER "ON" -> SUGGEST FK EQUALITY CONDITIONS
      // =========================================================================
      const onCtx = parseOnContext(fullTextBefore);
      if (onCtx) {
        let onPrio = 0;
        const rels = getRelationshipsForTable(onCtx.currentTable.name);
        onCtx.prevTables.forEach(prevT => {
          rels.forEach(rel => {
            if (rel.targetTable.toLowerCase() === prevT.name.toLowerCase()) {
              const seq = String(onPrio++).padStart(2, '0');
              const cond = `${onCtx.currentTable.alias}.${rel.sourceCol} = ${prevT.alias}.${rel.targetCol}`;
              suggestions.push({
                label: cond,
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText: cond,
                range: range,
                detail: `⚡ Condición FK (${onCtx.currentTable.alias} ↔ ${prevT.alias})`,
                documentation: {
                  value: `**Condición de unión por Clave Foránea**:\n\`${cond}\``
                },
                sortText: `0000_A_${seq}_${cond}`
              });
            }
          });
        });

        // Also suggest columns from current table and prev tables
        [onCtx.currentTable, ...onCtx.prevTables].forEach(tbl => {
          const cols = schemaColumnsMap[tbl.name] || [];
          cols.forEach(c => {
            suggestions.push({
              label: `${tbl.alias}.${c.name}`,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: `${tbl.alias}.${c.name}`,
              range: range,
              detail: `${c.full_type || c.data_type} • ${tbl.name}`,
              sortText: `0001_${tbl.alias}_${c.name}`
            });
          });
        });

        if (suggestions.length > 0) {
          return { suggestions };
        }
      }

      // =========================================================================
      // CONTEXT 2.C: AFTER "FROM", "INTO", "TABLE", "UPDATE" -> SUGGEST TABLES + AUTO-ALIAS
      // =========================================================================
      const isAfterInto = /\b(?:INSERT\s+INTO|INTO)\s+[`\w]*$/i.test(lineUntilCursor) ||
        /\b(?:INSERT\s+INTO|INTO)\s+[`\w]*$/i.test(fullTextBefore);
      const isAfterFromOrUpdate = /(?:FROM|TABLE|UPDATE)\s+[`\w]*$/i.test(lineUntilCursor) ||
        /\b(?:FROM|TABLE|UPDATE)\s+[`\w]*$/i.test(fullTextBefore);

      if (isAfterInto) {
        schemaTables.forEach(t => {
          suggestions.push({
            label: t.name,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: t.name,
            range: range,
            detail: `Tabla (${t.approx_rows ?? 0} filas aprox)`,
            sortText: '00_' + t.name
          });
        });
        return { suggestions };
      }

      if (isAfterFromOrUpdate) {
        schemaTables.forEach(t => {
          const alias = generateTableAlias(t.name);

          // Priority 1: Table with alias explicitly shown in label: "pedidos p"
          suggestions.push({
            label: `${t.name} ${alias}`,
            filterText: `${t.name} ${alias}`,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: `${t.name} ${alias}`,
            range: range,
            detail: `⚡ Tabla con alias automático (${alias})`,
            documentation: {
              value: `Inserta la tabla **${t.name}** con su alias asignado automáticamente:\n\`\`\`sql\n${t.name} ${alias}\n\`\`\``
            },
            sortText: '00_A_' + t.name
          });

          // Priority 2: Table name alone in label ("pedidos") -> ALSO inserts "pedidos p"
          suggestions.push({
            label: t.name,
            filterText: t.name,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: `${t.name} ${alias}`,
            range: range,
            detail: `Tabla (${t.approx_rows ?? 0} filas aprox) • Inserta: ${t.name} ${alias}`,
            documentation: {
              value: `Inserta la tabla con su alias asignado automáticamente:\n\`\`\`sql\n${t.name} ${alias}\n\`\`\``
            },
            sortText: '00_B_' + t.name
          });

          // Optional: table name without alias (for when user explicitly doesn't want alias)
          suggestions.push({
            label: `${t.name} (sin alias)`,
            filterText: `${t.name} sin alias`,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: t.name,
            range: range,
            detail: `Solo nombre de tabla (${t.approx_rows ?? 0} filas aprox)`,
            sortText: '00_Z_' + t.name
          });
        });
        return { suggestions };
      }

      // =========================================================================
      // CONTEXT 3: AFTER "SELECT" (and before "FROM") -> SUGGEST COLUMNS, ALIASES & AGGREGATES
      // =========================================================================
      const isSelectingColumns = /SELECT\s+(?:DISTINCT\s+)?[^;]*$/i.test(lineUntilCursor) && !/FROM/i.test(lineUntilCursor);
      if (isSelectingColumns) {
        // Find all tables and aliases in this query (from FROM / JOIN)
        const queryTables = extractQueryTableAliases(model.getValue());
        if (queryTables.length > 0) {
          queryTables.forEach(t => {
            // Suggest alias itself (e.g. "c")
            suggestions.push({
              label: t.alias,
              kind: monaco.languages.CompletionItemKind.Variable,
              insertText: t.alias,
              range: range,
              detail: `⚡ Alias de tabla: ${t.name}`,
              sortText: `0000_A_alias_${t.alias}`
            });

            // Suggest alias.* (e.g. "c.*")
            suggestions.push({
              label: `${t.alias}.*`,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: `${t.alias}.*`,
              range: range,
              detail: `⚡ Todas las columnas de ${t.name} (${t.alias}.*)`,
              sortText: `0000_B_star_${t.alias}`
            });

            // Suggest columns qualified by this alias (e.g. "c.id", "c.nombre")
            const cols = schemaColumnsMap[t.name] || [];
            cols.forEach(c => {
              suggestions.push({
                label: `${t.alias}.${c.name}`,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: `${t.alias}.${c.name}`,
                range: range,
                detail: `${c.full_type || c.data_type} • ${t.name}`,
                sortText: `0001_${t.alias}_${c.name}`
              });
            });
          });
        }
        // 1. Suggest all columns from connected database
        Object.keys(schemaColumnsMap).forEach(table => {
          (schemaColumnsMap[table] || []).forEach(c => {
            suggestions.push({
              label: c.name,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: c.name,
              range: range,
              detail: `${c.full_type || c.data_type} • Tabla: ${table}`,
              sortText: '01_' + c.name
            });
          });
        });

        // 2. Suggest aggregate functions
        SQL_FUNCTIONS.forEach(fn => {
          suggestions.push({
            label: fn.label,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: fn.insertText,
            insertTextRules: fn.isSnippet ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
            range: range,
            detail: fn.detail,
            sortText: '02_' + fn.label
          });
        });

        suggestions.push({
          label: '*',
          kind: monaco.languages.CompletionItemKind.Operator,
          insertText: '*',
          range: range,
          detail: 'Todas las columnas',
          sortText: '00_all'
        });

        return { suggestions };
      }

      // =========================================================================
      // CONTEXT 4: WHERE / HAVING / ON / ORDER BY / GROUP BY -> SUGGEST COLUMNS
      // =========================================================================
      const isConditionOrSort = /(?:WHERE|ON|HAVING|ORDER\s+BY|GROUP\s+BY|AND|OR)\s+[`\w]*$/i.test(lineUntilCursor);
      if (isConditionOrSort) {
        Object.keys(schemaColumnsMap).forEach(table => {
          (schemaColumnsMap[table] || []).forEach(c => {
            suggestions.push({
              label: c.name,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: c.name,
              range: range,
              detail: `${c.full_type || c.data_type} • ${table}`,
              sortText: '00_' + c.name
            });
          });
        });

        // Comparison keywords
        ['IS NULL', 'IS NOT NULL', 'BETWEEN', 'LIKE', 'IN', 'ASC', 'DESC'].forEach(kw => {
          suggestions.push({
            label: kw,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: kw,
            range: range,
            detail: 'Operador / Modificador SQL',
            sortText: '05_' + kw
          });
        });

        return { suggestions };
      }

      // =========================================================================
      // DEFAULT / GENERAL SQL AUTOCOMPLETION
      // =========================================================================

      // Shortcut: Typing SEL or sel immediately suggests "SELECT * FROM "
      suggestions.push({
        label: 'SELECT * FROM ',
        filterText: 'SEL sel select SELECT * FROM',
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: 'SELECT * FROM ',
        range: range,
        detail: 'Atajo rápido: SELECT * FROM',
        sortText: '000_A_SELECT_ALL'
      });

      suggestions.push({
        label: 'SEL',
        filterText: 'SEL sel',
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: 'SELECT * FROM ',
        range: range,
        detail: 'Atajo: SELECT * FROM',
        sortText: '000_B_SEL'
      });

      // 1. Tables (sin comillas)
      schemaTables.forEach(t => {
        const alias = generateTableAlias(t.name);
        suggestions.push({
          label: `${t.name} ${alias}`,
          filterText: `${t.name} ${alias}`,
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: `${t.name} ${alias}`,
          range: range,
          detail: `Tabla (${t.approx_rows ?? 0} filas aprox) • Alias: ${alias}`,
          sortText: '02_A_' + t.name
        });
        suggestions.push({
          label: t.name,
          filterText: t.name,
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: `${t.name} ${alias}`,
          range: range,
          detail: `Tabla (${t.approx_rows ?? 0} filas aprox) • Inserta: ${t.name} ${alias}`,
          sortText: '02_B_' + t.name
        });
      });

      // 2. Columns (sin comillas)
      Object.keys(schemaColumnsMap).forEach(table => {
        (schemaColumnsMap[table] || []).forEach(c => {
          suggestions.push({
            label: c.name,
            kind: monaco.languages.CompletionItemKind.Field,
            insertText: c.name,
            range: range,
            detail: `${c.full_type || c.data_type} (${table})`,
            sortText: '03_' + c.name
          });
        });
      });

      // 3. SQL Keywords
      SQL_KEYWORDS.forEach(kw => {
        suggestions.push({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw,
          range: range,
          detail: 'Palabra clave SQL',
          sortText: '04_' + kw
        });
      });

      // 4. Built-in functions
      SQL_FUNCTIONS.forEach(fn => {
        suggestions.push({
          label: fn.label,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: fn.insertText,
          insertTextRules: fn.isSnippet ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
          range: range,
          detail: fn.detail,
          sortText: '05_' + fn.label
        });
      });

      // 5. Common Templates / Snippets (sin comillas)
      suggestions.push({
        label: 'SELECT * FROM ...',
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: 'SELECT * FROM ${1:tabla} LIMIT 100;',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range: range,
        detail: 'Consulta básica SELECT',
        sortText: '01_snippet_select'
      });

      suggestions.push({
        label: 'CREATE TABLE ...',
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: 'CREATE TABLE ${1:nombre_tabla} (\n  id INT AUTO_INCREMENT PRIMARY KEY,\n  ${2:nombre} VARCHAR(255) NOT NULL,\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range: range,
        detail: 'Plantilla completa de CREATE TABLE',
        sortText: '01_snippet_create_table'
      });

      suggestions.push({
        label: 'LATERAL (subquery) alias',
        filterText: 'LATERAL lateral subquery join lateral',
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: 'LATERAL (\n  SELECT ${1:*}\n  FROM ${2:tabla}\n  WHERE ${3:condicion}\n) ${4:alias}',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range: range,
        detail: 'Tabla derivada LATERAL (MySQL 8.0+)',
        sortText: '01_snippet_lateral'
      });

      return { suggestions };
    }
  });
}

// Register SQL Hover Provider: Show table columns (NAME & DATA TYPE) after 0.3s delay
function registerSqlHoverProvider() {
  if (!window.monaco) return;

  monaco.languages.registerHoverProvider('sql', {
    provideHover: (model, position) => {
      let wordAtPosition = model.getWordAtPosition(position);
      let hoveredWord = wordAtPosition ? wordAtPosition.word : null;

      // Fallback: check if cursor is on/inside backtick identifier `table_name`
      if (!hoveredWord) {
        const lineContent = model.getLineContent(position.lineNumber);
        const col = position.column;
        const regex = /[`"']([a-zA-Z0-9_]+)[`"']/g;
        let m;
        while ((m = regex.exec(lineContent)) !== null) {
          const startCol = m.index + 1;
          const endCol = startCol + m[0].length;
          if (col >= startCol && col <= endCol) {
            hoveredWord = m[1];
            wordAtPosition = {
              word: m[1],
              startColumn: startCol,
              endColumn: endCol
            };
            break;
          }
        }
      }

      if (!hoveredWord) return null;

      // Ignore SQL keywords unless it is an explicitly registered table
      const SQL_KEYWORDS = new Set([
        'SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS',
        'ON', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'ORDER', 'GROUP', 'BY', 'HAVING',
        'LIMIT', 'OFFSET', 'UNION', 'ALL', 'AS', 'INTO', 'VALUES', 'SET', 'UPDATE',
        'DELETE', 'INSERT', 'CREATE', 'TABLE', 'DROP', 'ALTER', 'CASE', 'WHEN', 'THEN',
        'ELSE', 'END', 'LIKE', 'BETWEEN', 'EXISTS', 'DISTINCT', 'ASC', 'DESC'
      ]);

      let resolvedTableName = null;
      let matchedAlias = null;

      // 1. Direct match with a table in current database schema
      const directTable = schemaTables.find(t => t.name.toLowerCase() === hoveredWord.toLowerCase());
      if (directTable) {
        resolvedTableName = directTable.name;
      } else {
        const directKey = Object.keys(schemaColumnsMap).find(k => k.toLowerCase() === hoveredWord.toLowerCase());
        if (directKey) {
          resolvedTableName = directKey;
        }
      }

      // 2. If not a direct table match and not a reserved keyword, check if it's an alias in this query
      if (!resolvedTableName && !SQL_KEYWORDS.has(hoveredWord.toUpperCase())) {
        const queryTables = extractQueryTableAliases(model.getValue());
        const foundAlias = queryTables.find(t => t.alias && t.alias.toLowerCase() === hoveredWord.toLowerCase());
        if (foundAlias) {
          resolvedTableName = Object.keys(schemaColumnsMap).find(
            t => t.toLowerCase() === foundAlias.name.toLowerCase()
          ) || foundAlias.name;
          matchedAlias = foundAlias.alias;
        }
      }

      // 3. Fallback: check if hoveredWord is a column of a known table
      if (!resolvedTableName && !SQL_KEYWORDS.has(hoveredWord.toUpperCase())) {
        const matchingCols = [];
        Object.keys(schemaColumnsMap).forEach(tName => {
          (schemaColumnsMap[tName] || []).forEach(col => {
            if (col.name.toLowerCase() === hoveredWord.toLowerCase()) {
              matchingCols.push({ table: tName, col });
            }
          });
        });

        if (matchingCols.length > 0) {
          let colMd = `### 🏷️ Columna: \`${matchingCols[0].col.name}\`\n\n`;
          matchingCols.forEach(item => {
            const typeStr = (item.col.full_type || item.col.data_type || 'desconocido').toUpperCase();
            colMd += `- **Tabla:** \`${item.table}\` • **Tipo:** \`${typeStr}\`\n`;
          });

          return {
            range: new monaco.Range(
              position.lineNumber,
              wordAtPosition.startColumn,
              position.lineNumber,
              wordAtPosition.endColumn
            ),
            contents: [{ value: colMd }]
          };
        }

        return null;
      }

      if (!resolvedTableName) return null;

      // Retrieve columns for this table (case-insensitive lookup)
      let columns = schemaColumnsMap[resolvedTableName];
      if (!columns) {
        const actualKey = Object.keys(schemaColumnsMap).find(k => k.toLowerCase() === resolvedTableName.toLowerCase());
        if (actualKey) columns = schemaColumnsMap[actualKey];
      }
      columns = columns || [];

      // Find approx row count
      const tableInfo = schemaTables.find(t => t.name.toLowerCase() === resolvedTableName.toLowerCase());
      const approxRows = tableInfo?.approx_rows != null ? tableInfo.approx_rows : null;

      // Build rich markdown table with NAME and DATA TYPE of each column
      let md = `### 📋 Tabla: \`${resolvedTableName}\`${matchedAlias ? ` *(Alias: \`${matchedAlias}\`)*` : ''}\n\n`;

      if (approxRows !== null) {
        md += `> **${columns.length} columna${columns.length === 1 ? '' : 's'}** • *~${approxRows.toLocaleString()} filas aprox.*\n\n`;
      } else {
        md += `> **${columns.length} columna${columns.length === 1 ? '' : 's'}**\n\n`;
      }

      if (columns.length > 0) {
        md += `| # | Nombre de Columna | Tipo de Dato |\n`;
        md += `| :-: | :--- | :--- |\n`;
        columns.forEach((col, idx) => {
          const typeStr = (col.full_type || col.data_type || 'desconocido').toUpperCase();
          md += `| ${idx + 1} | **\`${col.name}\`** | \`${typeStr}\` |\n`;
        });
      } else {
        md += `*(No se encontraron columnas cargadas para esta tabla)*\n`;
      }

      return {
        range: new monaco.Range(
          position.lineNumber,
          wordAtPosition.startColumn,
          position.lineNumber,
          wordAtPosition.endColumn
        ),
        contents: [
          { value: md }
        ]
      };
    }
  });
}

// Update autocomplete items with current database schema
function updateSchemaCompletions(tables, columnsMap = {}, foreignKeys = []) {
  schemaTables = Array.isArray(tables) ? tables : [];
  schemaColumnsMap = columnsMap || {};
  schemaForeignKeys = Array.isArray(foreignKeys) ? foreignKeys : [];
  buildForeignKeyGraph();
}

// Helper to create an editor instance in a DOM element
async function createEditor(domElement, initialValue = '', onRunCallback = null, onSaveCallback = null) {
  await initMonacoLoader();

  if (window.monaco) {
    const editor = monaco.editor.create(domElement, {
      value: initialValue,
      language: 'sql',
      theme: 'mysql-dark',
      automaticLayout: true,
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      lineNumbers: 'on',
      roundedSelection: true,
      padding: { top: 10, bottom: 10 },
      hover: {
        enabled: true,
        delay: 300 // Activarse luego de 0.3s (300ms) de estar el cursor sobre el texto
      },
      suggestOnTriggerCharacters: true,
      quickSuggestions: {
        other: true,
        comments: false,
        strings: true
      },
      wordBasedSuggestions: "off" // Prioritize our intelligent semantic provider
    });

    // Add Ctrl+Enter or Cmd+Enter command
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      if (onRunCallback) {
        const selection = editor.getSelection();
        const selectedText = editor.getModel().getValueInRange(selection);
        const queryToRun = selectedText && selectedText.trim() ? selectedText : editor.getValue();
        onRunCallback(queryToRun);
      }
    });

    // Add F5 command
    editor.addCommand(monaco.KeyCode.F5, () => {
      if (onRunCallback) {
        onRunCallback(editor.getValue());
      }
    });

    // Add Ctrl+S command
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (onSaveCallback) {
        onSaveCallback(editor.getValue());
      }
    });

    return {
      getValue: () => editor.getValue(),
      setValue: (val) => editor.setValue(val),
      getSelectedText: () => {
        const sel = editor.getSelection();
        return editor.getModel().getValueInRange(sel);
      },
      format: () => {
        editor.getAction('editor.action.formatDocument')?.run();
      },
      focus: () => editor.focus(),
      layout: () => editor.layout(),
      destroy: () => editor.dispose()
    };
  } else {
    // Fallback: Textarea editor
    domElement.innerHTML = `
      <textarea class="form-control" style="width:100%; height:100%; resize:none; font-family:monospace; font-size:13px; background:#1e1e1e; color:#fff; border:none; padding:12px;"></textarea>
    `;
    const textarea = domElement.querySelector('textarea');
    textarea.value = initialValue;

    textarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (onRunCallback) onRunCallback(textarea.value);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (onSaveCallback) onSaveCallback(textarea.value);
      }
    });

    return {
      getValue: () => textarea.value,
      setValue: (val) => { textarea.value = val; },
      getSelectedText: () => {
        return textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
      },
      format: () => {},
      focus: () => textarea.focus(),
      layout: () => {},
      destroy: () => {}
    };
  }
}
