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
    this.resultsNav = document.getElementById('resultsNavTabs');
    this.panelResults = document.getElementById('panelResults');
    this.limitSelect = document.getElementById('queryLimitSelect');

    this.currentColumns = [];
    this.currentRows = [];
    this.activeSelectResults = [];
    this.currentSelectIdx = 0;
    this.currentExportFormat = localStorage.getItem('dbide_export_format') || 'xlsx';
    this.lastExecutedSql = '';
    this.sortCol = null;
    this.sortAsc = true;
    this.unreadMessages = 0;

    // Virtual scrolling configuration
    this.ROW_HEIGHT = 29;
    this.OVERSCAN = 15;
    this.isScrollTicking = false;

    this.initLimitSelect();
    this.setupVirtualScrollListener();
    this.bindExports();
    this.bindTableCopyEvents();
    this.bindClearMessages();
  }

  initLimitSelect() {
    if (!this.limitSelect) return;
    const savedLimit = localStorage.getItem('dbide_query_row_limit') || '100';
    if ([...this.limitSelect.options].some(o => o.value === savedLimit)) {
      this.limitSelect.value = savedLimit;
    }
    this.limitSelect.addEventListener('change', () => {
      localStorage.setItem('dbide_query_row_limit', this.limitSelect.value);
    });
  }

  setupVirtualScrollListener() {
    if (!this.panelResults) return;
    this.panelResults.addEventListener('scroll', () => {
      if (!this.isScrollTicking) {
        window.requestAnimationFrame(() => {
          this.renderVirtualSlice();
          this.isScrollTicking = false;
        });
        this.isScrollTicking = true;
      }
    }, { passive: true });

    window.addEventListener('resize', () => {
      if (this.currentRows && this.currentRows.length > 0) {
        this.renderVirtualSlice();
      }
    });
  }

  bindClearMessages() {
    document.getElementById('btnClearMessages')?.addEventListener('click', () => {
      if (this.messagesBox) {
        this.messagesBox.innerHTML = '<div class="msg-entry msg-info">Consola limpiada.</div>';
      }
      this.resetMessageBadge();
    });
  }

  bindTableCopyEvents() {
    if (!this.resultsBody) return;

    this.resultsBody.addEventListener('dblclick', async (e) => {
      const td = e.target.closest('td');
      if (!td) return;
      const tr = td.closest('tr');
      if (!tr || tr.classList.contains('virtual-spacer-row')) return;

      const rowIndex = parseInt(tr.dataset.rowIndex, 10);
      if (isNaN(rowIndex)) return;
      const rowData = this.currentRows[rowIndex];
      if (!rowData) return;

      if (td.classList.contains('row-num-cell') || td.cellIndex === 0) {
        // DOUBLE CLICK ON ROW NUMBER: Copy entire row!
        await this.copyRowToClipboard(rowIndex, rowData, tr);
      } else {
        // DOUBLE CLICK ON DATA CELL: Copy this field's value!
        const colIdx = parseInt(td.dataset.colIdx, 10);
        const val = (colIdx >= 0 && colIdx < rowData.length) ? rowData[colIdx] : td.textContent.trim();
        await this.copyCellToClipboard(val, td);
      }
    });
  }

  async copyRowToClipboard(rowIndex, rowData, tr) {
    const tsvText = rowData.map(v => v === null ? 'NULL' : String(v)).join('\t');
    try {
      await this.writeClipboardText(tsvText);

      // Visual flash animation on the whole row
      tr.classList.remove('row-copied-flash');
      void tr.offsetWidth;
      tr.classList.add('row-copied-flash');
      setTimeout(() => tr.classList.remove('row-copied-flash'), 650);

      this.showCopyToast(`📋 Fila #${rowIndex + 1} copiada al portapapeles (${rowData.length} columnas)`);
      this.logMessage(`Fila #${rowIndex + 1} copiada al portapapeles (${rowData.length} columnas).`, 'info');
    } catch (err) {
      console.error('Error al copiar fila:', err);
    }
  }

  async copyCellToClipboard(val, td) {
    const text = val === null ? 'NULL' : String(val);
    try {
      await this.writeClipboardText(text);

      // Visual flash animation on the clicked cell
      td.classList.remove('cell-copied-flash');
      void td.offsetWidth;
      td.classList.add('cell-copied-flash');
      setTimeout(() => td.classList.remove('cell-copied-flash'), 550);

      const preview = text.length > 40 ? text.substring(0, 37) + '...' : text;
      this.showCopyToast(`📋 Copiado al portapapeles: "${preview}"`);
    } catch (err) {
      console.error('Error al copiar celda:', err);
    }
  }

  async writeClipboardText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (_) {}
    }
    // Fallback for non-secure contexts or permission restrictions
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  showCopyToast(message) {
    let toast = document.getElementById('appCopyToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'appCopyToast';
      toast.className = 'copy-toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<i data-lucide="clipboard-check" style="width:14px; height:14px; color:#38bdf8;"></i> <span>${this.escapeHtml(message)}</span>`;
    if (window.lucide) lucide.createIcons();
    toast.classList.add('show');

    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 2200);
  }

  resetMessageBadge() {
    this.unreadMessages = 0;
    if (this.msgBadge) {
      this.msgBadge.style.display = 'none';
      this.msgBadge.textContent = '0';
    }
  }

  bindExports() {
    const btnSelect = document.getElementById('btnExportFormatSelect');
    const menuPopup = document.getElementById('exportDropdownMenu');
    const btnAction = document.getElementById('btnExportAction');
    const caretIcon = document.getElementById('exportFormatCaret');

    // Restore saved format UI
    this.setExportFormatUI(this.currentExportFormat);

    // Toggle dropdown menu
    btnSelect?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = menuPopup?.classList.toggle('open');
      if (menuPopup) {
        menuPopup.style.display = isOpen ? 'flex' : 'none';
      }
      if (caretIcon) {
        caretIcon.setAttribute('data-lucide', isOpen ? 'chevron-down' : 'chevron-up');
        if (window.lucide) lucide.createIcons();
      }
    });

    // Handle menu option selection
    menuPopup?.querySelectorAll('.export-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const selectedFormat = item.dataset.format;
        this.setExportFormatUI(selectedFormat);
        if (menuPopup) {
          menuPopup.classList.remove('open');
          menuPopup.style.display = 'none';
        }
        if (caretIcon) {
          caretIcon.setAttribute('data-lucide', 'chevron-up');
          if (window.lucide) lucide.createIcons();
        }
        // Immediately export with the chosen format
        this.export(selectedFormat);
      });
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (menuPopup && menuPopup.classList.contains('open')) {
        if (!e.target.closest('#exportSplitGroup')) {
          menuPopup.classList.remove('open');
          menuPopup.style.display = 'none';
          if (caretIcon) {
            caretIcon.setAttribute('data-lucide', 'chevron-up');
            if (window.lucide) lucide.createIcons();
          }
        }
      }
    });

    // Close menu on Escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menuPopup && menuPopup.classList.contains('open')) {
        menuPopup.classList.remove('open');
        menuPopup.style.display = 'none';
        if (caretIcon) {
          caretIcon.setAttribute('data-lucide', 'chevron-up');
          if (window.lucide) lucide.createIcons();
        }
      }
    });

    // Main action button click: export with current format
    btnAction?.addEventListener('click', () => {
      this.export(this.currentExportFormat);
    });
  }

  setExportFormatUI(format) {
    this.currentExportFormat = format;
    localStorage.setItem('dbide_export_format', format);

    const formatLabel = document.getElementById('exportFormatLabel');
    const formatIcon = document.getElementById('exportFormatIcon');
    const menuPopup = document.getElementById('exportDropdownMenu');

    const meta = {
      xlsx: { label: 'Excel (.xlsx)', icon: 'file-spreadsheet', color: '#10b981' },
      csv: { label: 'CSV (.csv)', icon: 'file-text', color: '#38bdf8' },
      json: { label: 'JSON (.json)', icon: 'file-code', color: '#f59e0b' },
      sql_insert: { label: 'SQL (INSERT)', icon: 'file-plus', color: '#a855f7' },
      sql_update: { label: 'SQL (UPDATE)', icon: 'file-pen', color: '#ec4899' }
    }[format] || { label: 'Excel (.xlsx)', icon: 'file-spreadsheet', color: '#10b981' };

    if (formatLabel) formatLabel.textContent = meta.label;
    if (formatIcon) {
      formatIcon.setAttribute('data-lucide', meta.icon);
      formatIcon.style.color = meta.color;
    }

    if (menuPopup) {
      menuPopup.querySelectorAll('.export-menu-item').forEach(item => {
        const isSelected = item.dataset.format === format;
        item.classList.toggle('active', isSelected);
        const checkIcon = item.querySelector('.export-item-check');
        if (checkIcon) {
          checkIcon.style.display = isSelected ? 'inline-block' : 'none';
        }
      });
    }

    if (window.lucide) lucide.createIcons();
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
    this.lastExecutedSql = sql;

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
    const rowLimit = this.limitSelect ? parseInt(this.limitSelect.value, 10) : 100;

    try {
      const res = await fetch('/api/query/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, database, limit: rowLimit })
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
        this.renderResultsTabs([], data.duration_ms);
        this.logMessage(`Consulta ejecutada correctamente (${data.duration_ms} ms). Sin filas afectadas.`, 'success');
        this.switchTab('panelMessages');
        this.statsBadge.textContent = `⚡ ${data.duration_ms} ms`;
        return;
      }

      // Check primary result set
      const selectResults = results.filter(r => r.type === 'SELECT' && r.columns && r.columns.length > 0);
      if (selectResults.length > 0) {
        this.activeSelectResults = selectResults;
        this.currentSelectIdx = 0;
        this.renderResultsTabs(selectResults, data.duration_ms);
        this.selectResultTab(0, data.duration_ms);
        this.switchTab('panelResults');

        selectResults.forEach((sr, idx) => {
          const info = sr.is_limited
            ? `${sr.rows.length} de ${sr.total_count} filas (limitado a ${sr.limit})`
            : `${sr.rows.length} filas`;
          this.logMessage(`Consulta ${idx + 1} completada (${data.duration_ms} ms): ${info} devueltas.`, 'success');
        });
      } else {
        // Mutation or DDL
        this.renderResultsTabs([], data.duration_ms);
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

      this.renderSingleCustomTab('Plan EXPLAIN', data.rows.length);
      this.renderTable(data.columns, data.rows);
      this.switchTab('panelResults');
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

  renderResultsTabs(selectResults, durationMs) {
    this.activeSelectResults = selectResults || [];
    this.resultsNav = document.getElementById('resultsNavTabs') || document.querySelector('.results-header .results-nav');
    if (!this.resultsNav) return;

    if (!selectResults || selectResults.length === 0) {
      this.resultsNav.innerHTML = `
        <button class="results-tab-btn active" data-idx="0">
          <i data-lucide="table-2" style="width:13px; height:13px;"></i>
          <span>Resultados</span>
        </button>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    if (selectResults.length === 1) {
      const sr = selectResults[0];
      const countLabel = sr.is_limited ? `${sr.rows.length}/${sr.total_count}` : `${sr.rows.length}`;
      this.resultsNav.innerHTML = `
        <button class="results-tab-btn active" data-idx="0" title="${sr.message || ''}">
          <i data-lucide="table-2" style="width:13px; height:13px;"></i>
          <span>Resultado 1</span>
          <span class="results-tab-pill">${countLabel}</span>
        </button>
      `;
    } else {
      // Multiple queries (e.g. SELECT * FROM pedidos; SELECT * FROM clientes;)
      this.resultsNav.innerHTML = selectResults.map((sr, idx) => {
        const countLabel = sr.is_limited ? `${sr.rows.length}/${sr.total_count}` : `${sr.rows.length}`;
        const activeCls = idx === this.currentSelectIdx ? 'active' : '';
        return `
          <button class="results-tab-btn ${activeCls}" data-idx="${idx}" title="Consulta ${idx + 1}: ${sr.message || ''}">
            <i data-lucide="table-2" style="width:13px; height:13px;"></i>
            <span>Resultado ${idx + 1}</span>
            <span class="results-tab-pill">${countLabel}</span>
          </button>
        `;
      }).join('');
    }

    if (window.lucide) lucide.createIcons();

    this.resultsNav.querySelectorAll('.results-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        this.selectResultTab(idx, durationMs);
      });
    });
  }

  selectResultTab(idx, durationMs) {
    if (!this.activeSelectResults || !this.activeSelectResults[idx]) return;
    this.currentSelectIdx = idx;

    if (this.resultsNav) {
      this.resultsNav.querySelectorAll('.results-tab-btn').forEach((btn) => {
        const bIdx = parseInt(btn.dataset.idx, 10);
        btn.classList.toggle('active', bIdx === idx);
      });
    }

    const sel = this.activeSelectResults[idx];
    this.renderTable(sel.columns, sel.rows);

    const countInfo = sel.is_limited
      ? `${sel.rows.length} de ${sel.total_count} filas (limitado a ${sel.limit})`
      : `${sel.rows.length} fila${sel.rows.length === 1 ? '' : 's'}`;
    const prefix = this.activeSelectResults.length > 1 ? `Resultado ${idx + 1}: ` : '';
    this.statsBadge.textContent = `⚡ ${durationMs} ms | ${prefix}${countInfo}`;
  }

  renderSingleCustomTab(title, count) {
    this.activeSelectResults = [];
    this.currentSelectIdx = 0;
    this.resultsNav = document.getElementById('resultsNavTabs') || document.querySelector('.results-header .results-nav');
    if (!this.resultsNav) return;
    this.resultsNav.innerHTML = `
      <button class="results-tab-btn active" data-idx="0">
        <i data-lucide="activity" style="width:13px; height:13px;"></i>
        <span>${this.escapeHtml(title)}</span>
        <span class="results-tab-pill">${count}</span>
      </button>
    `;
    if (window.lucide) lucide.createIcons();
  }

  renderTable(columns, rows) {
    this.currentColumns = columns || [];
    this.currentRows = rows || [];
    this.sortCol = null;
    this.sortAsc = true;

    if (this.emptyState) this.emptyState.style.display = 'none';
    if (this.resultsTable) this.resultsTable.style.display = 'table';

    // Render Headers
    let headHtml = '<tr><th style="width:46px; text-align:center; user-select:none;">#</th>';
    this.currentColumns.forEach((col, idx) => {
      headHtml += `<th data-col-idx="${idx}" title="Clic para ordenar">${this.escapeHtml(col)} <span class="sort-icon" style="font-size:10px; opacity:0.6;"></span></th>`;
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

    if (this.panelResults) {
      this.panelResults.scrollTop = 0;
    }

    this.renderVirtualSlice();
  }

  renderVirtualSlice() {
    if (!this.resultsBody) return;

    if (!this.currentRows || this.currentRows.length === 0) {
      const colSpan = (this.currentColumns ? this.currentColumns.length : 0) + 1;
      this.resultsBody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center; color:var(--text-dim); padding:20px;">Sin filas devueltas</td></tr>`;
      return;
    }

    const totalRows = this.currentRows.length;
    const scrollTop = this.panelResults ? this.panelResults.scrollTop : 0;
    const viewportHeight = (this.panelResults && this.panelResults.clientHeight) ? this.panelResults.clientHeight : 400;

    // Calculate visible range with buffer
    const startIdx = Math.max(0, Math.floor(scrollTop / this.ROW_HEIGHT) - this.OVERSCAN);
    const endIdx = Math.min(totalRows, Math.ceil((scrollTop + viewportHeight) / this.ROW_HEIGHT) + this.OVERSCAN);

    const topSpacerHeight = startIdx * this.ROW_HEIGHT;
    const bottomSpacerHeight = (totalRows - endIdx) * this.ROW_HEIGHT;
    const colSpan = this.currentColumns.length + 1;

    let html = '';

    // Top virtual spacer
    if (topSpacerHeight > 0) {
      html += `<tr class="virtual-spacer-row" style="height:${topSpacerHeight}px;"><td colspan="${colSpan}" style="height:${topSpacerHeight}px;"></td></tr>`;
    }

    // Rendered window slice
    for (let i = startIdx; i < endIdx; i++) {
      const row = this.currentRows[i];
      html += `<tr data-row-index="${i}"><td class="row-num-cell" title="Doble clic para copiar toda la fila #${i + 1}">${i + 1}</td>`;
      for (let c = 0; c < row.length; c++) {
        const val = row[c];
        if (val === null) {
          html += `<td class="data-cell" data-col-idx="${c}" title="Doble clic para copiar valor (NULL)"><span class="null-badge">NULL</span></td>`;
        } else {
          const strVal = String(val);
          const escaped = this.escapeHtml(strVal);
          html += `<td class="data-cell" data-col-idx="${c}" title="Doble clic para copiar: ${escaped}">${escaped}</td>`;
        }
      }
      html += '</tr>';
    }

    // Bottom virtual spacer
    if (bottomSpacerHeight > 0) {
      html += `<tr class="virtual-spacer-row" style="height:${bottomSpacerHeight}px;"><td colspan="${colSpan}" style="height:${bottomSpacerHeight}px;"></td></tr>`;
    }

    this.resultsBody.innerHTML = html;
  }

  sortTable(colIdx) {
    if (this.sortCol === colIdx) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortCol = colIdx;
      this.sortAsc = true;
    }

    this.resultsHead.querySelectorAll('th[data-col-idx]').forEach(th => {
      const idx = parseInt(th.dataset.colIdx, 10);
      const iconSpan = th.querySelector('.sort-icon');
      if (idx === colIdx) {
        th.style.color = '#38bdf8';
        if (iconSpan) iconSpan.textContent = this.sortAsc ? ' ▲' : ' ▼';
      } else {
        th.style.color = '';
        if (iconSpan) iconSpan.textContent = '';
      }
    });

    this.currentRows.sort((a, b) => {
      const vA = a[colIdx];
      const vB = b[colIdx];
      if (vA === null && vB === null) return 0;
      if (vA === null) return 1;
      if (vB === null) return -1;
      if (typeof vA === 'number' && typeof vB === 'number') {
        return this.sortAsc ? vA - vB : vB - vA;
      }
      return this.sortAsc 
        ? String(vA).localeCompare(String(vB))
        : String(vB).localeCompare(String(vA));
    });

    this.renderVirtualSlice();
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
    const targetFormat = format || this.currentExportFormat || 'xlsx';
    if (!this.currentColumns.length || !this.currentRows.length) {
      alert('No hay datos disponibles para exportar.');
      return;
    }

    let tableName = 'tabla';
    let keyColumn = null;

    if (targetFormat === 'sql_insert' || targetFormat === 'sql_update') {
      let defaultTable = 'tabla';
      if (this.lastExecutedSql) {
        const match = this.lastExecutedSql.match(/\bFROM\s+`?([a-zA-Z0-9_]+)`?/i);
        if (match && match[1]) {
          defaultTable = match[1];
        }
      }
      const promptAction = targetFormat === 'sql_insert' ? 'INSERT' : 'UPDATE';
      const chosenTable = window.prompt(
        `Ingresa el nombre de la tabla para las sentencias ${promptAction}:`,
        defaultTable
      );
      if (!chosenTable || !chosenTable.trim()) {
        return; // Usuario canceló
      }
      tableName = chosenTable.trim();

      if (targetFormat === 'sql_update') {
        const defaultKey = this.currentColumns.find(c => {
          const cl = c.toLowerCase();
          return cl === 'id' || cl.startsWith('id_') || cl.endsWith('_id');
        }) || this.currentColumns[0];

        const chosenKey = window.prompt(
          `Columna identificadora para la condición WHERE (WHERE columna = valor):\nColumnas disponibles: ${this.currentColumns.join(', ')}`,
          defaultKey
        );
        if (!chosenKey || !chosenKey.trim()) {
          return; // Usuario canceló
        }
        keyColumn = chosenKey.trim();
      }
    }

    const btnAction = document.getElementById('btnExportAction');
    const origHtml = btnAction ? btnAction.innerHTML : '';
    if (btnAction) {
      btnAction.disabled = true;
      btnAction.innerHTML = '<span style="font-size:10px;">Exportando...</span>';
    }

    try {
      const res = await fetch(`/api/export/${targetFormat}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columns: this.currentColumns,
          rows: this.currentRows,
          filename: `mysql_export_${tableName}_${targetFormat}_${Date.now()}`,
          table_name: tableName,
          key_column: keyColumn
        })
      });

      if (!res.ok) {
        let errDetail = 'Error al exportar los datos.';
        try {
          const errJson = await res.json();
          errDetail = errJson.detail || errJson.error || errDetail;
        } catch (_) {}
        throw new Error(errDetail);
      }

      const ext = (targetFormat === 'sql_insert' || targetFormat === 'sql_update') ? 'sql' : targetFormat;
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mysql_export_${tableName}_${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      const formatTitle = targetFormat.startsWith('sql_') ? targetFormat.toUpperCase().replace('_', ' ') : targetFormat.toUpperCase();
      this.logMessage(`Exportación completada: ${this.currentRows.length} filas descargadas en ${formatTitle}.`, 'success');
    } catch (err) {
      alert(`Error al exportar: ${err.message}`);
      this.logMessage(`Error en exportación (${targetFormat.toUpperCase()}): ${err.message}`, 'error');
    } finally {
      if (btnAction) {
        btnAction.disabled = false;
        btnAction.innerHTML = origHtml;
        if (window.lucide) lucide.createIcons();
      }
    }
  }
}
