// Query Execution, Results Table Rendering, and Data Export

class QueryExecutor {
  constructor() {
    this.resultsTable = document.getElementById('resultsTable');
    this.resultsHead = document.getElementById('resultsTableHead');
    this.resultsBody = document.getElementById('resultsTableBody');
    this.emptyState = document.getElementById('emptyResultsState');
    this.messagesBox = document.getElementById('panelMessages');
    this.messagesView = document.getElementById('sidebarMessagesView');
    this.msgBadge = document.getElementById('sidebarMsgBadge');
    this.statsBadge = document.getElementById('resultStatsBadge');

    this.currentColumns = [];
    this.currentRows = [];
    this.sortCol = null;
    this.sortAsc = true;
    this.unreadMessages = 0;

    this.bindExports();
    this.bindClearMessages();
  }

  bindClearMessages() {
    document.getElementById('btnClearMessages')?.addEventListener('click', () => {
      if (this.messagesBox) {
        this.messagesBox.innerHTML = '<div class="msg-entry msg-info">Consola limpiada.</div>';
      }
      this.resetMessageBadge();
    });
  }

  resetMessageBadge() {
    this.unreadMessages = 0;
    if (this.msgBadge) {
      this.msgBadge.style.display = 'none';
      this.msgBadge.textContent = '0';
    }
  }

  bindExports() {
    document.getElementById('btnExportCsv')?.addEventListener('click', () => this.export('csv'));
    document.getElementById('btnExportJson')?.addEventListener('click', () => this.export('json'));
  }

  // Detection of UPDATE / DELETE without WHERE clause
  detectDangerousStatements(sql) {
    if (!sql || typeof sql !== 'string') return [];

    // 1. Tokenize comments, strings, and raw code
    const regex = /(--[^\r\n]*|#[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
    const tokens = [];
    let lastEnd = 0;
    let match;

    while ((match = regex.exec(sql)) !== null) {
      if (match.index > lastEnd) {
        tokens.push({ type: 'CODE', val: sql.slice(lastEnd, match.index) });
      }
      const val = match[0];
      if (val.startsWith('-') || val.startsWith('#') || val.startsWith('/')) {
        tokens.push({ type: 'COMMENT', val });
      } else {
        tokens.push({ type: 'STR', val });
      }
      lastEnd = regex.lastIndex;
    }
    if (lastEnd < sql.length) {
      tokens.push({ type: 'CODE', val: sql.slice(lastEnd) });
    }

    // 2. Separate into statements by ';' in CODE tokens
    const statements = [];
    let currentStmt = [];

    for (const token of tokens) {
      if (token.type === 'CODE' && token.val.includes(';')) {
        const parts = token.val.split(';');
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (part) {
            currentStmt.push({ type: 'CODE', val: part });
          }
          if (i < parts.length - 1) {
            statements.push(currentStmt);
            currentStmt = [];
          }
        }
      } else {
        currentStmt.push(token);
      }
    }
    if (currentStmt.length > 0) {
      statements.push(currentStmt);
    }

    const dangerous = [];

    for (const stmtTokens of statements) {
      const origText = stmtTokens.map(t => t.val).join('').trim();
      if (!origText) continue;

      // Build code text without comments or string values
      const codeWords = [];
      for (const t of stmtTokens) {
        if (t.type === 'CODE') {
          codeWords.push(t.val);
        } else if (t.type === 'STR') {
          codeWords.push(" 'STR' ");
        }
      }
      const codeText = codeWords.join(' ');

      // Check if statement begins with UPDATE or DELETE
      const startMatch = codeText.match(/^\s*(UPDATE|DELETE)\b/i);
      if (startMatch) {
        const qType = startMatch[1].toUpperCase();

        // Strip subquery parentheses to test the top-level statement's WHERE clause
        let topLevelCode = codeText;
        let prev = '';
        while (prev !== topLevelCode) {
          prev = topLevelCode;
          topLevelCode = topLevelCode.replace(/\([^()]*\)/g, ' ');
        }

        const hasWhere = /\bWHERE\b/i.test(topLevelCode);
        if (!hasWhere) {
          dangerous.push({
            type: qType,
            statement: origText
          });
        }
      }
    }

    return dangerous;
  }

  promptDangerousWarning(dangerousList, database) {
    return new Promise((resolve) => {
      const modal = document.getElementById('modalDangerousQuery');
      const listContainer = document.getElementById('dangerousQueryList');
      const dbBadge = document.getElementById('dangerousQueryDb');
      const btnConfirm = document.getElementById('btnConfirmDangerousQuery');
      const btnCancel = document.getElementById('btnCancelDangerousQuery');
      const btnClose = document.getElementById('btnCloseDangerousModal');

      if (!modal || !listContainer) {
        const msg = `⚠️ ADVERTENCIA DE SEGURIDAD:\n\nSe detectó una sentencia UPDATE o DELETE sin cláusula WHERE en la base de datos "${database || 'activa'}".\nEsto modificará o eliminará TODOS los registros de la tabla.\n\n¿Estás seguro de que deseas continuar?`;
        resolve(window.confirm(msg));
        return;
      }

      if (dbBadge) {
        let envText = '';
        if (window.app && window.app.currentEnvironment === 'production') {
          envText = ' • 🔴 PRODUCCIÓN (ALTO RIESGO)';
        } else if (window.app && window.app.currentEnvironment === 'sandbox') {
          envText = ' • 🟡 SANDBOX';
        } else if (window.app && window.app.currentEnvironment === 'development') {
          envText = ' • 🟢 DESARROLLO';
        }
        dbBadge.textContent = (database || '(Base de datos actual)') + envText;
      }

      // Render dangerous statements cards
      listContainer.innerHTML = dangerousList.map(item => `
        <div class="danger-stmt-card">
          <div class="danger-stmt-badge">
            <i data-lucide="alert-triangle" style="width:12px; height:12px;"></i> ${item.type} SIN CLÁUSULA WHERE
          </div>
          <pre class="danger-stmt-sql">${this.escapeHtml(item.statement)}</pre>
        </div>
      `).join('');

      if (window.lucide) lucide.createIcons();

      modal.classList.add('open');

      // Put focus on Cancel button by default to prevent accidental executions with Enter
      setTimeout(() => {
        btnCancel?.focus();
      }, 50);

      const cleanup = () => {
        btnConfirm?.removeEventListener('click', onConfirm);
        btnCancel?.removeEventListener('click', onCancel);
        btnClose?.removeEventListener('click', onCancel);
        window.removeEventListener('keydown', onKeyDown);
        modal.classList.remove('open');
      };

      const onConfirm = () => {
        cleanup();
        resolve(true);
      };

      const onCancel = () => {
        cleanup();
        resolve(false);
      };

      const onKeyDown = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      };

      btnConfirm?.addEventListener('click', onConfirm);
      btnCancel?.addEventListener('click', onCancel);
      btnClose?.addEventListener('click', onCancel);
      window.addEventListener('keydown', onKeyDown);
    });
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async run(sql, database) {
    if (!sql || !sql.trim()) {
      this.logMessage('Consulta vacía.', 'info');
      return;
    }

    // Safety Check: Detect UPDATE or DELETE without WHERE
    const dangerous = this.detectDangerousStatements(sql);
    if (dangerous.length > 0) {
      const confirmed = await this.promptDangerousWarning(dangerous, database);
      if (!confirmed) {
        const types = [...new Set(dangerous.map(d => d.type))].join(' y ');
        this.logMessage(`⚠️ Operación cancelada por seguridad: Se detectó sentencia ${types} sin cláusula WHERE.`, 'warning');
        this.switchTab('panelMessages');
        return;
      }
    }

    this.setLoading(true);
    const start = performance.now();

    try {
      const res = await fetch('/api/query/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, database })
      });

      const data = await res.json();
      const clientDuration = Math.round(performance.now() - start);

      if (!res.ok || !data.success) {
        const errorMsg = data.error || data.detail || 'Error desconocido';
        this.logMessage(`Error en la consulta (${data.duration_ms || clientDuration} ms):\n${errorMsg}`, 'error');
        this.switchTab('panelMessages');
        this.statsBadge.textContent = `❌ Error (${data.duration_ms || clientDuration} ms)`;
        return;
      }

      const results = data.results || [];
      if (results.length === 0) {
        this.clearResultNavPills();
        this.logMessage(`Consulta ejecutada correctamente (${data.duration_ms} ms). Sin filas afectadas.`, 'success');
        this.switchTab('panelMessages');
        this.statsBadge.textContent = `⚡ ${data.duration_ms} ms`;
        return;
      }

      // Check primary result set
      const selectResults = results.filter(r => r.type === 'SELECT' && r.columns && r.columns.length > 0);
      if (selectResults.length > 0) {
        if (selectResults.length === 1) {
          const firstSelect = selectResults[0];
          this.clearResultNavPills();
          this.renderTable(firstSelect.columns, firstSelect.rows);
          this.switchTab('panelResults');
          this.statsBadge.textContent = `⚡ ${data.duration_ms} ms | ${firstSelect.rows.length} fila${firstSelect.rows.length === 1 ? '' : 's'}`;
          this.logMessage(`Consulta completada (${data.duration_ms} ms): ${firstSelect.rows.length} filas devueltas.`, 'success');
        } else {
          // Multiple SELECT queries returned
          this.renderMultiSelectResults(selectResults, data.duration_ms);
        }
      } else {
        // Mutation or DDL
        this.clearResultNavPills();
        const totalAffected = results.reduce((acc, r) => acc + (r.row_count || 0), 0);
        this.logMessage(`Comandos ejecutados (${data.duration_ms} ms). Total filas afectadas: ${totalAffected}.`, 'success');
        this.switchTab('panelMessages');
        this.statsBadge.textContent = `⚡ ${data.duration_ms} ms | ${totalAffected} afectadas`;
      }
    } catch (err) {
      this.logMessage(`Error de comunicación con el servidor: ${err.message}`, 'error');
      this.switchTab('panelMessages');
    } finally {
      this.setLoading(false);
    }
  }

  async runExplain(sql, database) {
    if (!sql || !sql.trim()) return;

    this.setLoading(true);
    try {
      const res = await fetch('/api/query/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, database })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.detail || data.error || 'Error al ejecutar EXPLAIN');
      }

      this.renderTable(data.columns, data.rows);
      this.statsBadge.textContent = `⚡ EXPLAIN (${data.duration_ms} ms) | ${data.rows.length} fila${data.rows.length === 1 ? '' : 's'}`;
      this.logMessage(`Plan EXPLAIN completado (${data.duration_ms} ms): ${data.rows.length} filas analizadas.`, 'info');
    } catch (err) {
      this.logMessage(`Error en EXPLAIN: ${err.message}`, 'error');
      this.switchTab('panelMessages');
      this.statsBadge.textContent = '❌ Error en EXPLAIN';
    } finally {
      this.setLoading(false);
    }
  }

  renderMultiSelectResults(selectResults, durationMs) {
    this.switchTab('panelResults');
    const nav = document.querySelector('.results-header .results-nav');
    if (!nav) {
      this.renderTable(selectResults[0].columns, selectResults[0].rows);
      return;
    }

    let pillsContainer = document.getElementById('resultsNavPills');
    if (!pillsContainer) {
      pillsContainer = document.createElement('div');
      pillsContainer.id = 'resultsNavPills';
      pillsContainer.style.display = 'flex';
      pillsContainer.style.gap = '4px';
      pillsContainer.style.marginLeft = '8px';
      nav.appendChild(pillsContainer);
    }

    pillsContainer.innerHTML = selectResults.map((sr, idx) => `
      <button class="btn btn-sm btn-res-tab ${idx === 0 ? 'btn-primary' : ''}" data-idx="${idx}" style="font-size:11px; padding:2px 8px;">
        Resultado ${idx + 1} (${sr.rows.length})
      </button>
    `).join('');

    pillsContainer.querySelectorAll('.btn-res-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        pillsContainer.querySelectorAll('.btn-res-tab').forEach(b => b.classList.remove('btn-primary'));
        btn.classList.add('btn-primary');
        const selIdx = parseInt(btn.dataset.idx, 10);
        const selObj = selectResults[selIdx];
        this.renderTable(selObj.columns, selObj.rows);
        this.statsBadge.textContent = `⚡ ${durationMs} ms | Resultado ${selIdx + 1} (${selObj.rows.length} filas)`;
      });
    });

    this.renderTable(selectResults[0].columns, selectResults[0].rows);
    this.statsBadge.textContent = `⚡ ${durationMs} ms | ${selectResults.length} consultas (${selectResults[0].rows.length} filas)`;

    selectResults.forEach((sr, idx) => {
      this.logMessage(`Consulta ${idx + 1} completada: ${sr.rows.length} filas devueltas.`, 'success');
    });
  }

  clearResultNavPills() {
    const pills = document.getElementById('resultsNavPills');
    if (pills) pills.remove();
  }

  renderTable(columns, rows) {
    this.currentColumns = columns;
    this.currentRows = rows;
    this.sortCol = null;

    this.emptyState.style.display = 'none';
    this.resultsTable.style.display = 'table';

    // Render Headers
    let headHtml = '<tr><th style="width:40px; text-align:center;">#</th>';
    columns.forEach((col, idx) => {
      headHtml += `<th data-col-idx="${idx}">${col}</th>`;
    });
    headHtml += '</tr>';
    this.resultsHead.innerHTML = headHtml;

    // Attach sort listeners
    this.resultsHead.querySelectorAll('th[data-col-idx]').forEach(th => {
      th.addEventListener('click', () => {
        const idx = parseInt(th.dataset.colIdx, 10);
        this.sortTable(idx);
      });
    });

    this.renderRows(rows);
  }

  renderRows(rows) {
    let bodyHtml = '';
    rows.forEach((row, rIdx) => {
      bodyHtml += `<tr><td style="text-align:center; color:var(--text-dim);">${rIdx + 1}</td>`;
      row.forEach(val => {
        if (val === null) {
          bodyHtml += '<td><span class="null-badge">NULL</span></td>';
        } else {
          const strVal = String(val);
          const escaped = strVal.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          bodyHtml += `<td title="${escaped}">${escaped}</td>`;
        }
      });
      bodyHtml += '</tr>';
    });
    this.resultsBody.innerHTML = bodyHtml;
  }

  sortTable(colIdx) {
    if (this.sortCol === colIdx) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortCol = colIdx;
      this.sortAsc = true;
    }

    const sorted = [...this.currentRows].sort((a, b) => {
      const vA = a[colIdx];
      const vB = b[colIdx];
      if (vA === null) return 1;
      if (vB === null) return -1;
      if (typeof vA === 'number' && typeof vB === 'number') {
        return this.sortAsc ? vA - vB : vB - vA;
      }
      return this.sortAsc 
        ? String(vA).localeCompare(String(vB))
        : String(vB).localeCompare(String(vA));
    });

    this.renderRows(sorted);
  }

  logMessage(text, type = 'info') {
    let cls = 'msg-info';
    if (type === 'error') cls = 'msg-error';
    else if (type === 'success') cls = 'msg-success';
    else if (type === 'warning') cls = 'msg-warning';

    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `msg-entry ${cls}`;
    entry.textContent = `[${time}] ${text}`;
    if (this.messagesBox) {
      this.messagesBox.appendChild(entry);
    }
    if (this.messagesView) {
      this.messagesView.scrollTop = this.messagesView.scrollHeight;
    }

    if (window.app && window.app.activeSidebarTab !== 'messages') {
      this.unreadMessages++;
      if (this.msgBadge) {
        this.msgBadge.textContent = this.unreadMessages > 99 ? '99+' : this.unreadMessages;
        this.msgBadge.style.display = 'inline-block';
        if (type === 'error') {
          this.msgBadge.style.background = '#ef4444';
        }
      }
    }
  }

  switchTab(targetId) {
    if (targetId === 'panelMessages') {
      if (window.app && window.app.switchSidebarTab) {
        window.app.switchSidebarTab('messages');
      }
    }
  }

  setLoading(loading) {
    if (loading) {
      this.statsBadge.textContent = 'Ejecutando...';
    }
  }

  async export(format) {
    if (!this.currentColumns.length || !this.currentRows.length) {
      alert('No hay datos disponibles para exportar.');
      return;
    }

    try {
      const res = await fetch(`/api/export/${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columns: this.currentColumns,
          rows: this.currentRows,
          filename: `mysql_query_export_${Date.now()}`
        })
      });

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mysql_export_${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Error al exportar: ${err.message}`);
    }
  }
}
