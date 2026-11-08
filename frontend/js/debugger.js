// Stored Procedure Debugger Engine & UI (dbForge-style Step-by-Step Debugger)
class StoredProcedureDebugger {
  constructor() {
    this.activeSession = null;
    this.breakpoints = new Set();
    this.activeTab = null;
    this.debugLogs = [];
    this.pollInterval = null;

    this.createFloatingBar();
    this.createBottomPanel();
    this.createParamsModal();
    this.bindGlobalShortcuts();
  }

  // --- UI Elements Creation ---
  createFloatingBar() {
    let bar = document.getElementById('debugFloatingBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'debugFloatingBar';
      bar.className = 'debug-floating-bar';
      bar.style.display = 'none';
      bar.innerHTML = `
        <div class="debug-drag-handle" title="Barra de control de depuración">
          <i data-lucide="grip-vertical" style="width:12px; height:12px; opacity:0.5;"></i>
        </div>
        <div class="debug-status-pill" id="dbgStatusPill">
          <span class="dbg-status-dot"></span>
          <span id="dbgStatusText">Iniciando...</span>
        </div>
        <div class="debug-btn-group">
          <button class="btn btn-sm btn-dbg-action" id="btnDbgContinue" title="Continuar (F5) - Corre hasta el siguiente breakpoint o el final">
            <i data-lucide="play" style="width:13px; height:13px; fill:#22c55e; color:#22c55e;"></i>
            <span>Continuar</span>
            <span class="dbg-key-badge">F5</span>
          </button>
          <button class="btn btn-sm btn-dbg-action" id="btnDbgStepOver" title="Paso a paso (F10) - Ejecuta la sentencia actual y se detiene en la siguiente">
            <i data-lucide="corner-down-right" style="width:13px; height:13px; color:#38bdf8;"></i>
            <span>Paso a paso</span>
            <span class="dbg-key-badge">F10</span>
          </button>
          <button class="btn btn-sm btn-dbg-action btn-dbg-stop" id="btnDbgStop" title="Detener Depuración (Shift+F5)">
            <i data-lucide="square" style="width:13px; height:13px; fill:#ef4444; color:#ef4444;"></i>
            <span>Detener</span>
            <span class="dbg-key-badge">⇧F5</span>
          </button>
        </div>
      `;
      document.body.appendChild(bar);

      // Event listeners for floating bar
      bar.querySelector('#btnDbgContinue').addEventListener('click', () => this.continueExecution());
      bar.querySelector('#btnDbgStepOver').addEventListener('click', () => this.stepOver());
      bar.querySelector('#btnDbgStop').addEventListener('click', () => this.stopDebugging());

      if (window.lucide) lucide.createIcons();
    }
    this.floatingBar = bar;
  }

  createBottomPanel() {
    let panel = document.getElementById('debugBottomPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'debugBottomPanel';
      panel.className = 'debug-drawer';
      panel.style.display = 'none';
      panel.innerHTML = `
        <div class="debug-drawer-header">
          <div class="debug-drawer-tabs">
            <button class="dbg-tab-btn active" data-tab="vars">
              <i data-lucide="variable" style="width:12px; height:12px;"></i>
              <span>Variables Locales y Parámetros</span>
              <span class="dbg-badge" id="dbgVarsCount">0</span>
            </button>
            <button class="dbg-tab-btn" data-tab="bps">
              <i data-lucide="circle-dot" style="width:12px; height:12px;"></i>
              <span>Puntos de Interrupción</span>
              <span class="dbg-badge" id="dbgBpsCount">0</span>
            </button>
            <button class="dbg-tab-btn" data-tab="stack">
              <i data-lucide="layers" style="width:12px; height:12px;"></i>
              <span>Pila de Llamadas</span>
            </button>
            <button class="dbg-tab-btn" data-tab="console">
              <i data-lucide="terminal" style="width:12px; height:12px;"></i>
              <span>Consola de Depuración</span>
            </button>
          </div>
          <div class="debug-drawer-actions">
            <button class="action-icon" id="btnMinimizeDebugDrawer" title="Minimizar / Restaurar panel">
              <i data-lucide="chevron-down" style="width:13px; height:13px;"></i>
            </button>
            <button class="action-icon" id="btnCloseDebugDrawer" title="Cerrar panel de depuración">
              <i data-lucide="x" style="width:13px; height:13px;"></i>
            </button>
          </div>
        </div>
        <div class="debug-drawer-body">
          <!-- Tab 1: Variables -->
          <div class="dbg-tab-content active" id="dbgTabContent_vars">
            <table class="debug-vars-table">
              <thead>
                <tr>
                  <th style="width:200px;">Variable / Parámetro</th>
                  <th style="width:130px;">Ámbito</th>
                  <th>Valor Actual</th>
                </tr>
              </thead>
              <tbody id="dbgVarsTableBody">
                <tr><td colspan="3" style="text-align:center; color:var(--text-dim); padding:16px;">Sin variables disponibles</td></tr>
              </tbody>
            </table>
          </div>

          <!-- Tab 2: Breakpoints -->
          <div class="dbg-tab-content" id="dbgTabContent_bps">
            <div class="dbg-bps-list" id="dbgBpsList">
              <div style="padding:14px; color:var(--text-dim); font-size:12px;">No hay puntos de interrupción definidos. Haz clic en el margen izquierdo del editor para agregar uno.</div>
            </div>
          </div>

          <!-- Tab 3: Call Stack -->
          <div class="dbg-tab-content" id="dbgTabContent_stack">
            <div class="dbg-stack-list" id="dbgCallStackList">
              <div class="dbg-stack-item active">
                <i data-lucide="play-circle" style="width:13px; height:13px; color:#38bdf8;"></i>
                <span id="dbgStackProcName">Procedimiento</span>
                <span class="dbg-stack-line" id="dbgStackLine">Línea -</span>
              </div>
            </div>
          </div>

          <!-- Tab 4: Debug Console Logs -->
          <div class="dbg-tab-content" id="dbgTabContent_console">
            <div class="dbg-console-logs" id="dbgConsoleLogs"></div>
          </div>
        </div>
      `;
      document.body.appendChild(panel);

      // Drawer Tab switcher
      panel.querySelectorAll('.dbg-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          panel.querySelectorAll('.dbg-tab-btn').forEach(b => b.classList.remove('active'));
          panel.querySelectorAll('.dbg-tab-content').forEach(c => c.classList.remove('active'));
          btn.classList.add('active');
          const target = panel.querySelector(`#dbgTabContent_${btn.dataset.tab}`);
          if (target) target.classList.add('active');
        });
      });

      panel.querySelector('#btnMinimizeDebugDrawer').addEventListener('click', () => {
        panel.classList.toggle('minimized');
      });

      panel.querySelector('#btnCloseDebugDrawer').addEventListener('click', () => {
        if (this.activeSession) {
          if (confirm('¿Deseas detener la sesión de depuración actual?')) {
            this.stopDebugging();
          }
        } else {
          panel.style.display = 'none';
        }
      });

      if (window.lucide) lucide.createIcons();
    }
    this.bottomPanel = panel;
  }

  createParamsModal() {
    let modal = document.getElementById('modalDebugParams');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modalDebugParams';
      modal.className = 'modal-overlay';
      modal.style.zIndex = '1050';
      modal.innerHTML = `
        <div class="modal-dialog" style="max-width:480px;">
          <div class="modal-header">
            <div class="title-wrap" style="display:flex; align-items:center; gap:8px;">
              <i data-lucide="bug" style="width:16px; height:16px; color:#f59e0b;"></i>
              <span style="font-weight:700;">Iniciar Depuración: Parámetros</span>
            </div>
            <button class="action-icon btn-close-dbg-modal"><i data-lucide="x" style="width:14px; height:14px;"></i></button>
          </div>
          <div class="modal-body">
            <p style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">
              Ingresa los valores de prueba para los parámetros requeridos antes de iniciar la ejecución paso a paso:
            </p>
            <form id="formDebugParams" style="display:flex; flex-direction:column; gap:10px;"></form>
          </div>
          <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="btn btn-sm btn-secondary btn-cancel-dbg-modal">Cancelar</button>
            <button class="btn btn-sm btn-primary" id="btnConfirmStartDebug" style="background:#f59e0b; border-color:#d97706; color:#000; font-weight:600;">
              <i data-lucide="play" style="width:13px; height:13px;"></i> Iniciar Depuración
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('open');
      });

      modal.querySelectorAll('.btn-close-dbg-modal, .btn-cancel-dbg-modal').forEach(btn => {
        btn.addEventListener('click', () => modal.classList.remove('open'));
      });

      if (window.lucide) lucide.createIcons();
    }
    this.paramsModal = modal;
  }

  bindGlobalShortcuts() {
    window.addEventListener('keydown', (e) => {
      // F10: Step Over
      if (e.key === 'F10') {
        if (this.activeSession && this.activeSession.status === 'PAUSED') {
          e.preventDefault();
          this.stepOver();
        }
      }
      // F5: Continue (only if debugger is paused)
      else if (e.key === 'F5' && !e.ctrlKey && !e.shiftKey) {
        if (this.activeSession && this.activeSession.status === 'PAUSED') {
          e.preventDefault();
          this.continueExecution();
        }
      }
      // Shift+F5: Stop Debugging
      else if (e.shiftKey && e.key === 'F5') {
        if (this.activeSession) {
          e.preventDefault();
          this.stopDebugging();
        }
      }
      // F9: Toggle breakpoint on current line
      else if (e.key === 'F9') {
        const activeTab = window.app ? window.app.tabs.find(t => t.id === window.app.activeTabId) : null;
        if (activeTab && activeTab.editorInstance) {
          const rawEd = activeTab.editorInstance.getRawEditor ? activeTab.editorInstance.getRawEditor() : null;
          if (rawEd) {
            const pos = rawEd.getPosition();
            if (pos) {
              e.preventDefault();
              this.toggleBreakpoint(pos.lineNumber);
            }
          }
        }
      }
    });
  }

  // --- Breakpoint Management ---
  toggleBreakpoint(lineNumber) {
    if (this.breakpoints.has(lineNumber)) {
      this.breakpoints.delete(lineNumber);
      this.logMessage(`Punto de interrupción eliminado en línea ${lineNumber}.`, 'info');
    } else {
      this.breakpoints.add(lineNumber);
      this.logMessage(`Punto de interrupción fijado en línea ${lineNumber}.`, 'info');
    }

    this.syncBreakpointsUI();

    // If session is active, notify backend of updated breakpoints
    if (this.activeSession && this.activeSession.session_id) {
      fetch(`/api/debug/${this.activeSession.session_id}/breakpoints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ breakpoints: Array.from(this.breakpoints) })
      }).catch(err => console.error('Error sincronizando breakpoints:', err));
    }
  }

  syncBreakpointsUI() {
    const lines = Array.from(this.breakpoints).sort((a, b) => a - b);

    // Update Monaco editor decorations across tabs
    if (window.app && window.app.tabs) {
      window.app.tabs.forEach(t => {
        if (t.editorInstance && typeof t.editorInstance.setBreakpointsDecorations === 'function') {
          t.editorInstance.setBreakpointsDecorations(lines);
        }
      });
    }

    // Update bottom panel badge and list
    const countBadge = document.getElementById('dbgBpsCount');
    if (countBadge) countBadge.textContent = lines.length;

    const listContainer = document.getElementById('dbgBpsList');
    if (listContainer) {
      if (lines.length === 0) {
        listContainer.innerHTML = '<div style="padding:14px; color:var(--text-dim); font-size:12px;">No hay puntos de interrupción activos. Haz clic en el margen izquierdo del editor para agregar uno.</div>';
      } else {
        listContainer.innerHTML = lines.map(ln => `
          <div class="dbg-bp-row" data-line="${ln}">
            <span class="dbg-bp-dot"></span>
            <span class="dbg-bp-label">Línea <b>${ln}</b></span>
            <button class="action-icon btn-remove-bp" data-line="${ln}" title="Eliminar punto de interrupción">
              <i data-lucide="trash-2" style="width:12px; height:12px;"></i>
            </button>
          </div>
        `).join('');

        listContainer.querySelectorAll('.btn-remove-bp').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const ln = parseInt(btn.dataset.line, 10);
            this.toggleBreakpoint(ln);
          });
        });

        if (window.lucide) lucide.createIcons();
      }
    }
  }

  // --- Debug Flow Controls ---
  async prepareAndStartDebug(database, procedureName, tabObj) {
    this.activeTab = tabObj;
    this.currentDatabase = database;
    this.currentProcedure = procedureName;

    try {
      // Auto-compile current editor content if open so MySQL has latest changes
      if (tabObj && tabObj.editorInstance) {
        const fullDdl = tabObj.editorInstance.getValue();
        if (fullDdl && fullDdl.trim()) {
          const m = fullDdl.match(/\bCREATE\s+(?:DEFINER\s*=\s*[^\s]+\s+)?PROCEDURE\s+`?([a-zA-Z0-9_]+)`?/i);
          if (m) {
            procedureName = m[1];
            this.currentProcedure = procedureName;
          }
          try {
            await fetch('/api/query/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sql: fullDdl, database })
            });
          } catch (e) {
            console.warn('Could not auto-compile procedure before debug:', e);
          }
        }
      }

      // Reset previous results in panel
      if (window.app && window.app.queryExec) {
        window.app.queryExec.renderResultsTabs([], 0);
      }

      // Check parameters required
      const res = await fetch(`/api/procedures/${encodeURIComponent(database)}/${encodeURIComponent(procedureName)}/params`);
      const data = await res.json();
      const params = (data && data.parameters) ? data.parameters : [];

      const inParams = params.filter(p => (p.mode || 'IN').toUpperCase() !== 'OUT');

      if (inParams.length > 0) {
        // Prompt user for parameter values
        this.showParamsModal(inParams, (paramValues) => {
          this.executeStart(database, procedureName, paramValues);
        });
      } else {
        // No IN parameters required, start immediately
        this.executeStart(database, procedureName, {});
      }
    } catch (err) {
      alert(`Error al preparar depuración: ${err.message}`);
    }
  }

  showParamsModal(inParams, onConfirm) {
    const form = this.paramsModal.querySelector('#formDebugParams');
    form.innerHTML = inParams.map(p => {
      const pName = p.name || `arg_${p.position}`;
      const typeStr = p.full_type || p.data_type || 'VARCHAR';
      return `
        <div class="form-group" style="margin-bottom:8px;">
          <label style="font-size:11px; font-weight:600; color:var(--text-normal); display:flex; justify-content:space-between;">
            <span>${pName}</span>
            <span style="font-size:10px; color:var(--text-dim);">${typeStr} (${p.mode || 'IN'})</span>
          </label>
          <input type="text" name="${pName}" class="form-control" placeholder="Valor para ${pName}..." style="font-family:var(--font-mono); font-size:12px; margin-top:3px;">
        </div>
      `;
    }).join('');

    this.paramsModal.classList.add('open');

    const btnConfirm = this.paramsModal.querySelector('#btnConfirmStartDebug');
    btnConfirm.onclick = (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const values = {};
      inParams.forEach(p => {
        const pName = p.name || `arg_${p.position}`;
        values[pName] = formData.get(pName) || '';
      });
      this.paramsModal.classList.remove('open');
      onConfirm(values);
    };
  }

  async executeStart(database, procedureName, paramValues) {
    this.showFloatingBar('Iniciando sesión de depuración...');
    this.openBottomPanel();
    this.logMessage(`Iniciando sesión de depuración para [${database}].[${procedureName}]...`, 'info');

    try {
      const res = await fetch('/api/debug/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          database: database,
          procedure_name: procedureName,
          parameters: paramValues,
          breakpoints: Array.from(this.breakpoints)
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.detail || data.error || 'Error al iniciar depuración');
      }

      this.activeSession = data.session;
      this.updateStateUI(this.activeSession);
      this.logMessage(`Sesión iniciada (#${this.activeSession.session_id}). Pausado en línea inicial ${this.activeSession.current_line}.`, 'success');

    } catch (err) {
      this.logMessage(`Error al iniciar depuración: ${err.message}`, 'error');
      alert(`Error al iniciar depuración: ${err.message}`);
      this.stopDebugging();
    }
  }

  async stepOver() {
    if (!this.activeSession || this.activeSession.status !== 'PAUSED') return;

    this.setControlsDisabled(true);
    this.updateStatusPill('RUNNING', 'Ejecutando paso...');

    try {
      const res = await fetch(`/api/debug/${this.activeSession.session_id}/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.detail || data.error || 'Error en paso');
      }

      this.activeSession = data.session;
      this.updateStateUI(this.activeSession);
    } catch (err) {
      this.logMessage(`Error en paso a paso: ${err.message}`, 'error');
    } finally {
      this.setControlsDisabled(false);
    }
  }

  async continueExecution() {
    if (!this.activeSession || this.activeSession.status !== 'PAUSED') return;

    this.setControlsDisabled(true);
    this.updateStatusPill('RUNNING', 'Ejecutando hasta siguiente breakpoint...');
    this.logMessage(`Continuando ejecución...`, 'info');

    try {
      const res = await fetch(`/api/debug/${this.activeSession.session_id}/continue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.detail || data.error || 'Error al continuar');
      }

      this.activeSession = data.session;
      this.updateStateUI(this.activeSession);
    } catch (err) {
      this.logMessage(`Error al continuar: ${err.message}`, 'error');
    } finally {
      this.setControlsDisabled(false);
    }
  }

  async stopDebugging() {
    if (this.activeSession && this.activeSession.session_id) {
      try {
        await fetch(`/api/debug/${this.activeSession.session_id}/stop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        console.error('Error al solicitar detención de depuración:', err);
      }
    }

    this.logMessage(`Sesión de depuración finalizada y limpiada.`, 'info');
    this.activeSession = null;
    this.hideFloatingBar();
    this.clearCurrentLineHighlight();
    this.updateStatusPill('STOPPED', 'Detenido');
  }

  // --- UI State Synchronization ---
  updateStateUI(session) {
    if (!session) return;

    const status = session.status;
    const line = session.current_line;

    if (status === 'PAUSED') {
      this.updateStatusPill('PAUSED', `Pausado en línea ${line}`);
      this.highlightCurrentLine(line);
      this.updateVariablesTable(session.variables, session.changed_variables);
      this.updateCallStack(session.procedure_name, line);
      this.logMessage(`Paso #${session.step_index}: detenido en línea ${line}.`, 'info');
    } else if (status === 'FINISHED') {
      this.updateStatusPill('FINISHED', `Completado con éxito (${session.duration_ms} ms)`);
      this.clearCurrentLineHighlight();
      this.updateVariablesTable(session.variables, []);
      this.logMessage(`Procedimiento ejecutado completamente en ${session.duration_ms} ms.`, 'success');

      if (session.out_params && Object.keys(session.out_params).length > 0) {
        this.logMessage(`Valores de salida (OUT): ${JSON.stringify(session.out_params)}`, 'success');
      }

      // Show result sets if returned
      if (session.result_sets && session.result_sets.length > 0) {
        const selectResults = session.result_sets.map((rs, idx) => ({
          statement_index: idx + 1,
          type: 'SELECT',
          columns: rs.columns,
          column_types: rs.column_types || [],
          rows: rs.rows,
          row_count: rs.row_count,
          total_count: rs.row_count,
          is_limited: false,
          limit: null,
          message: `${rs.row_count} fila${rs.row_count === 1 ? '' : 's'}`
        }));

        this.logMessage(`✓ Se obtuvieron ${session.result_sets.length} conjunto(s) de resultados en la depuración.`, 'success');

        if (window.app && window.app.queryExec) {
          window.app.queryExec.activeSelectResults = selectResults;
          window.app.queryExec.currentSelectIdx = 0;
          window.app.queryExec.renderResultsTabs(selectResults, session.duration_ms);
          window.app.queryExec.selectResultTab(0, session.duration_ms);
          window.app.queryExec.switchTab('panelResults');
        }
      } else {
        if (window.app && window.app.queryExec) {
          window.app.queryExec.renderResultsTabs([], session.duration_ms);
        }
      }

      this.logMessage(`Depuración finalizada (${session.duration_ms} ms). Los resultados se muestran en el panel inferior. Pulsa Detener (Shift+F5) cuando desees salir.`, 'info');

    } else if (status === 'ERROR') {
      this.updateStatusPill('ERROR', `Error en ejecución`);
      this.clearCurrentLineHighlight();
      this.logMessage(`Error en la depuración: ${session.error_message}`, 'error');
      alert(`Error en la depuración: ${session.error_message}`);
    }
  }

  highlightCurrentLine(lineNumber) {
    if (!lineNumber) {
      this.clearCurrentLineHighlight();
      return;
    }

    if (this.activeTab && this.activeTab.editorInstance && typeof this.activeTab.editorInstance.setCurrentLineDecoration === 'function') {
      this.activeTab.editorInstance.setCurrentLineDecoration(lineNumber);
    }
  }

  clearCurrentLineHighlight() {
    if (this.activeTab && this.activeTab.editorInstance && typeof this.activeTab.editorInstance.setCurrentLineDecoration === 'function') {
      this.activeTab.editorInstance.setCurrentLineDecoration(null);
    }
  }

  updateVariablesTable(varsObj, changedKeys = []) {
    const tbody = document.getElementById('dbgVarsTableBody');
    const countBadge = document.getElementById('dbgVarsCount');
    if (!tbody) return;

    const entries = Object.entries(varsObj || {});
    if (countBadge) countBadge.textContent = entries.length;

    if (entries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-dim); padding:16px;">Sin variables locales inicializadas en este paso</td></tr>';
      return;
    }

    const changedSet = new Set(changedKeys || []);

    tbody.innerHTML = entries.map(([key, val]) => {
      const isChanged = changedSet.has(key);
      const valStr = val === null ? 'NULL' : String(val);
      const valClass = val === null ? 'null-badge' : (isChanged ? 'debug-var-changed' : '');
      const changedBadge = isChanged ? '<span class="dbg-changed-pill" title="Valor modificado en el último paso">CAMBIÓ</span>' : '';

      return `
        <tr class="${isChanged ? 'row-var-changed' : ''}">
          <td class="dbg-var-name">
            <code>${key}</code>
            ${changedBadge}
          </td>
          <td class="dbg-var-scope" style="color:var(--text-dim); font-size:11px;">Local / Parámetro</td>
          <td class="dbg-var-val">
            <span class="${valClass}">${this.escapeHtml(valStr)}</span>
          </td>
        </tr>
      `;
    }).join('');
  }

  updateCallStack(procName, line) {
    const elName = document.getElementById('dbgStackProcName');
    const elLine = document.getElementById('dbgStackLine');
    if (elName) elName.textContent = procName || 'Procedimiento';
    if (elLine) elLine.textContent = line ? `Línea ${line}` : 'Finalizado';
  }

  logMessage(text, type = 'info') {
    const container = document.getElementById('dbgConsoleLogs');
    if (!container) return;

    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `dbg-log-entry dbg-log-${type}`;
    entry.textContent = `[${time}] ${text}`;
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
  }

  // --- Floating Controls Helper ---
  showFloatingBar(initialStatus = 'Iniciando...') {
    if (this.floatingBar) {
      this.floatingBar.style.display = 'flex';
      this.updateStatusPill('RUNNING', initialStatus);
      this.setControlsDisabled(false);
    }
  }

  hideFloatingBar() {
    if (this.floatingBar) {
      this.floatingBar.style.display = 'none';
    }
  }

  updateStatusPill(status, text) {
    const pill = document.getElementById('dbgStatusPill');
    const txt = document.getElementById('dbgStatusText');
    if (!pill || !txt) return;

    pill.className = `debug-status-pill status-${status.toLowerCase()}`;
    txt.textContent = text;
  }

  setControlsDisabled(disabled) {
    const btnCont = document.getElementById('btnDbgContinue');
    const btnStep = document.getElementById('btnDbgStepOver');
    if (btnCont) btnCont.disabled = disabled;
    if (btnStep) btnStep.disabled = disabled;
  }

  openBottomPanel() {
    if (this.bottomPanel) {
      this.bottomPanel.style.display = 'flex';
      this.bottomPanel.classList.remove('minimized');
    }
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
}

