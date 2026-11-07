// Main Application Orchestrator

class App {
  constructor() {
    this.tabs = [];
    this.activeTabId = null;
    this.tabCounter = 1;
    this.currentDatabase = null;
    this.connected = false;

    // Sidebar collapse state
    this.isSidebarCollapsed = localStorage.getItem('dbide_sidebar_collapsed') === 'true';
    this.isAutoCollapseEnabled = localStorage.getItem('dbide_sidebar_autocollapse') === 'true';
    this.activeSidebarTab = 'explorer';

    this.schemaTree = new SchemaTree('schemaTree', (action, payload) => this.handleSchemaAction(action, payload));
    this.procModal = new ProcedureModal();
    this.queryExec = new QueryExecutor();

    this.initElements();
    this.bindEvents();
    this.initSidebarCollapse();
    this.initSplitter();
    this.checkInitialSession();
  }

  initElements() {
    this.tabsBar = document.getElementById('tabsBar');
    this.tabContentArea = document.getElementById('tabContentArea');
    this.tabAddBtn = document.getElementById('tabAddBtn');
    this.dbSelect = document.getElementById('databaseSelect');
    this.statusDot = document.getElementById('statusDot');
    this.connectionText = document.getElementById('connectionText');
    this.sidebarEl = document.getElementById('appSidebar');
    this.sidebarStripEl = document.getElementById('sidebarCollapsedStrip');
    this.btnCollapseSidebar = document.getElementById('btnCollapseSidebar');
    this.btnExpandSidebar = document.getElementById('btnExpandSidebar');
    this.btnHeaderToggleSidebar = document.getElementById('btnHeaderToggleSidebar');
    this.btnToggleAutoCollapse = document.getElementById('btnToggleAutoCollapse');
    this.collapsedStripAutoBadge = document.getElementById('collapsedStripAutoBadge');

    // Sidebar navigation tabs
    this.tabBtnExplorer = document.getElementById('tabBtnExplorer');
    this.tabBtnMessages = document.getElementById('tabBtnMessages');
    this.sidebarExplorerFilterWrap = document.getElementById('sidebarExplorerFilterWrap');
    this.sidebarMessagesToolbar = document.getElementById('sidebarMessagesToolbar');
    this.schemaTreeEl = document.getElementById('schemaTree');
    this.sidebarMessagesView = document.getElementById('sidebarMessagesView');
  }

  bindEvents() {
    // New Query Tab
    this.tabAddBtn.addEventListener('click', () => this.createQueryTab());
    document.getElementById('btnNewQuery')?.addEventListener('click', () => this.createQueryTab());

    // Connections Modal
    document.getElementById('btnManageConnections')?.addEventListener('click', () => this.openConnectionsModal());
    document.getElementById('btnSidebarConnect')?.addEventListener('click', () => this.openConnectionsModal());
    document.getElementById('activeConnectionBadge')?.addEventListener('click', () => this.openConnectionsModal());
    document.getElementById('btnCloseConnModal')?.addEventListener('click', () => this.closeConnectionsModal());

    // Saved Queries Modal & Actions
    document.getElementById('btnOpenSavedQueries')?.addEventListener('click', () => this.openSavedQueriesModal());
    document.getElementById('btnCloseSavedQueriesModal')?.addEventListener('click', () => this.closeSavedQueriesModal());
    document.getElementById('btnSaveCurrentQueryFromList')?.addEventListener('click', () => {
      this.closeSavedQueriesModal();
      this.openSaveQueryModal();
    });
    document.getElementById('btnCloseSaveQueryModal')?.addEventListener('click', () => this.closeSaveQueryModal());
    document.getElementById('btnCancelSaveQuery')?.addEventListener('click', () => this.closeSaveQueryModal());
    document.getElementById('btnConfirmSaveQuery')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.saveCurrentQuery();
    });
    document.getElementById('savedQueriesSearchInput')?.addEventListener('input', (e) => {
      this.filterSavedQueries(e.target.value);
    });

    // History / Audit Log Modal & Filters
    document.getElementById('btnOpenHistory')?.addEventListener('click', () => this.openHistoryModal());
    document.getElementById('btnCloseHistoryModal')?.addEventListener('click', () => this.closeHistoryModal());
    document.getElementById('btnClearHistoryBtn')?.addEventListener('click', () => this.clearHistory());
    document.getElementById('historyTypeFilter')?.addEventListener('change', () => this.loadHistoryModal());
    document.getElementById('historyDbFilter')?.addEventListener('change', () => this.loadHistoryModal());
    document.getElementById('historySearchInput')?.addEventListener('input', () => this.loadHistoryModal());

    // Shortcuts Modal
    document.getElementById('btnShortcuts')?.addEventListener('click', () => {
      document.getElementById('modalShortcuts')?.classList.add('open');
    });
    document.getElementById('btnCloseShortcutsModal')?.addEventListener('click', () => {
      document.getElementById('modalShortcuts')?.classList.remove('open');
    });

    // Refresh Databases & Tables Button (sync button next to DB selector)
    document.getElementById('btnRefreshDatabases')?.addEventListener('click', async () => {
      this.setSyncSpinning(true);
      try {
        if (this.currentDatabase || this.dbSelect.value) {
          await this.loadDatabases(this.currentDatabase || this.dbSelect.value);
        } else {
          await this.loadDatabases();
        }
      } catch (err) {
        console.error("Error refreshing databases/schema:", err);
      } finally {
        this.setSyncSpinning(false);
        if (window.lucide) lucide.createIcons();
      }
    });

    // Database Switcher
    this.dbSelect.addEventListener('change', async (e) => {
      const newDb = e.target.value;
      if (newDb) {
        await this.switchDatabase(newDb);
      }
    });

    // Connection Form Events
    document.getElementById('btnNewConnItem')?.addEventListener('click', () => this.resetConnForm());
    document.getElementById('btnTestConn')?.addEventListener('click', () => this.testConnectionForm());
    document.getElementById('btnSaveConnOnly')?.addEventListener('click', () => this.saveConnectionForm(false));
    document.getElementById('btnSaveAndConnect')?.addEventListener('click', () => this.saveConnectionForm(true));
    document.getElementById('btnDeleteConn')?.addEventListener('click', () => this.deleteCurrentConnection());

    // Global desktop app keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      // Ctrl+Enter / Cmd+Enter: Execute selected query or statement in active tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (!e.target.closest('input, textarea, .modal-dialog')) {
          e.preventDefault();
          const activeTab = this.tabs.find(t => t.id === this.activeTabId && t.type === 'query');
          if (activeTab && activeTab.editorInstance) {
            const sql = (typeof activeTab.editorInstance.getQueryToRun === 'function')
              ? activeTab.editorInstance.getQueryToRun()
              : (activeTab.editorInstance.getSelectedText() || activeTab.editorInstance.getValue());
            this.onAutoCollapseTrigger();
            this.queryExec.run(sql, this.currentDatabase);
          }
        }
      }
      // F5: Execute selected query or statement in active tab
      else if (e.key === 'F5') {
        e.preventDefault();
        const activeTab = this.tabs.find(t => t.id === this.activeTabId && t.type === 'query');
        if (activeTab && activeTab.editorInstance) {
          const sql = (typeof activeTab.editorInstance.getQueryToRun === 'function')
            ? activeTab.editorInstance.getQueryToRun()
            : (activeTab.editorInstance.getSelectedText() || activeTab.editorInstance.getValue());
          this.onAutoCollapseTrigger();
          this.queryExec.run(sql, this.currentDatabase);
        }
      }
      // Ctrl+B / Cmd+B: Toggle sidebar
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        this.toggleSidebar();
      }
      // Ctrl+T: New query tab
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        this.createQueryTab();
      }
      // Alt+R: Reload schema / tables inside IDE
      else if (e.altKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        this.loadSchema(this.currentDatabase);
      }
      // Ctrl+W: Close active tab inside IDE (instead of closing the app window)
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (this.activeTabId) {
          this.closeTab(this.activeTabId);
        }
      }
    });

    // Native desktop app polish: prevent default browser context menu on blank UI surfaces
    document.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.monaco-editor, input, textarea, .data-table, .sidebar-tree-item, .history-card-sql')) {
        return; // Allow standard right-click for text selection / copying in code and data
      }
      e.preventDefault();
    });
  }

  initSplitter() {
    const resizer = document.getElementById('panelResizer');
    const resultsPanel = document.getElementById('resultsPanel');
    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
      isResizing = true;
      document.body.style.cursor = 'row-resize';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const totalH = window.innerHeight;
      const newH = totalH - e.clientY;
      if (newH > 100 && newH < totalH - 150) {
        resultsPanel.style.height = `${newH}px`;
      }
    });

    window.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = 'default';
        // Resize active monaco editor if present
        const activeTab = this.tabs.find(t => t.id === this.activeTabId);
        if (activeTab && activeTab.editorInstance) {
          activeTab.editorInstance.layout();
        }
      }
    });
  }

  // --- Sidebar Collapse & Auto-Collapse ---
  initSidebarCollapse() {
    this.btnCollapseSidebar?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.collapseSidebar();
    });

    this.btnExpandSidebar?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.expandSidebar();
    });

    this.sidebarStripEl?.addEventListener('click', (e) => {
      if (!e.target.closest('#btnExpandSidebar')) {
        this.expandSidebar();
      }
    });

    this.btnHeaderToggleSidebar?.addEventListener('click', () => {
      this.toggleSidebar();
    });

    this.btnToggleAutoCollapse?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleAutoCollapse();
    });

    // Sidebar tab clicks (Explorador / Mensajes)
    this.tabBtnExplorer?.addEventListener('click', () => {
      this.switchSidebarTab('explorer');
    });

    this.tabBtnMessages?.addEventListener('click', () => {
      this.switchSidebarTab('messages');
    });

    this.applySidebarState();
    this.updateAutoCollapseButton();
  }

  switchSidebarTab(tabName) {
    this.activeSidebarTab = tabName;

    // Expand sidebar if it was collapsed so the user can see the panel
    if (this.isSidebarCollapsed) {
      this.expandSidebar();
    }

    if (tabName === 'messages') {
      this.tabBtnMessages?.classList.add('active');
      this.tabBtnExplorer?.classList.remove('active');
      if (this.sidebarExplorerFilterWrap) this.sidebarExplorerFilterWrap.style.display = 'none';
      if (this.sidebarMessagesToolbar) this.sidebarMessagesToolbar.style.display = 'flex';
      if (this.schemaTreeEl) this.schemaTreeEl.style.display = 'none';
      if (this.sidebarMessagesView) {
        this.sidebarMessagesView.style.display = 'flex';
        this.sidebarMessagesView.scrollTop = this.sidebarMessagesView.scrollHeight;
      }
      this.queryExec?.resetMessageBadge();
    } else {
      this.tabBtnExplorer?.classList.add('active');
      this.tabBtnMessages?.classList.remove('active');
      if (this.sidebarExplorerFilterWrap) this.sidebarExplorerFilterWrap.style.display = 'block';
      if (this.sidebarMessagesToolbar) this.sidebarMessagesToolbar.style.display = 'none';
      if (this.schemaTreeEl) this.schemaTreeEl.style.display = 'block';
      if (this.sidebarMessagesView) this.sidebarMessagesView.style.display = 'none';
    }

    if (window.lucide) {
      lucide.createIcons();
    }
  }

  toggleSidebar() {
    if (this.isSidebarCollapsed) {
      this.expandSidebar();
    } else {
      this.collapseSidebar();
    }
  }

  collapseSidebar() {
    this.isSidebarCollapsed = true;
    localStorage.setItem('dbide_sidebar_collapsed', 'true');
    this.applySidebarState();
  }

  expandSidebar() {
    this.isSidebarCollapsed = false;
    localStorage.setItem('dbide_sidebar_collapsed', 'false');
    this.applySidebarState();
  }

  toggleAutoCollapse() {
    this.isAutoCollapseEnabled = !this.isAutoCollapseEnabled;
    localStorage.setItem('dbide_sidebar_autocollapse', String(this.isAutoCollapseEnabled));
    this.updateAutoCollapseButton();
  }

  updateAutoCollapseButton() {
    if (this.btnToggleAutoCollapse) {
      if (this.isAutoCollapseEnabled) {
        this.btnToggleAutoCollapse.classList.add('active');
        this.btnToggleAutoCollapse.setAttribute('title', 'Modo Auto activado: se contrae al ejecutar queries o abrir tablas (clic para desactivar)');
      } else {
        this.btnToggleAutoCollapse.classList.remove('active');
        this.btnToggleAutoCollapse.setAttribute('title', 'Modo Auto: colapsa el explorador automáticamente al ejecutar consultas o abrir datos (clic para activar)');
      }
    }
    if (this.collapsedStripAutoBadge) {
      this.collapsedStripAutoBadge.style.display = this.isAutoCollapseEnabled ? 'block' : 'none';
    }
    if (window.lucide) {
      lucide.createIcons();
    }
  }

  applySidebarState() {
    if (this.isSidebarCollapsed) {
      this.sidebarEl?.classList.add('collapsed');
      if (this.sidebarStripEl) this.sidebarStripEl.style.display = 'flex';
      if (this.btnHeaderToggleSidebar) {
        this.btnHeaderToggleSidebar.classList.add('active');
        this.btnHeaderToggleSidebar.setAttribute('title', 'Mostrar Explorador lateral (Ctrl+B / ⌘+B)');
      }
    } else {
      this.sidebarEl?.classList.remove('collapsed');
      if (this.sidebarStripEl) this.sidebarStripEl.style.display = 'none';
      if (this.btnHeaderToggleSidebar) {
        this.btnHeaderToggleSidebar.classList.remove('active');
        this.btnHeaderToggleSidebar.setAttribute('title', 'Ocultar Explorador lateral (Ctrl+B / ⌘+B)');
      }
    }
    this.layoutActiveEditor();
    if (window.lucide) {
      lucide.createIcons();
    }
  }

  layoutActiveEditor() {
    const runLayout = () => {
      const activeTab = this.tabs.find(t => t.id === this.activeTabId);
      if (activeTab && activeTab.editorInstance) {
        activeTab.editorInstance.layout();
      }
    };
    runLayout();
    setTimeout(runLayout, 80);
    setTimeout(runLayout, 240);
  }

  onAutoCollapseTrigger() {
    if (this.isAutoCollapseEnabled && !this.isSidebarCollapsed) {
      this.collapseSidebar();
    }
  }

  // --- Session Management ---
  async checkInitialSession() {
    this.createQueryTab();

    try {
      // 1. Check if server already has an active session
      let res = await fetch('/api/session/current');
      let data = await res.json();

      // 2. If not, auto-connect by default to the last used connection
      if (!data.connected) {
        const autoRes = await fetch('/api/session/auto-connect', { method: 'POST' });
        const autoData = await autoRes.json();
        if (autoData.connected) {
          data = autoData;
        }
      }

      if (data.connected) {
        this.setConnectedState(data);
        await this.loadDatabases(data.database);
      } else {
        this.setDisconnectedState();
        // Open modal only if there is no previous connection or it failed
        this.openConnectionsModal();
      }
    } catch (err) {
      this.setDisconnectedState();
      this.openConnectionsModal();
    }
  }

  setConnectedState(data) {
    this.connected = true;
    this.currentEnvironment = data.environment || 'development';
    this.statusDot.classList.add('connected');

    // Display connection name at the left of the environment badge
    const connName = (data.name && data.name.trim()) ? data.name.trim() : `${data.user}@${data.host}:${data.port}`;
    this.connectionText.textContent = connName;

    // Hover tooltip with full server host, user, port and database
    const tooltip = `Conexión: ${connName}\nServidor: ${data.user}@${data.host}:${data.port}${data.database ? '\nBase de datos: ' + data.database : ''}\nEntorno: ${(this.currentEnvironment || 'development').toUpperCase()}`;
    this.connectionText.title = tooltip;
    const badgeWrap = document.getElementById('activeConnectionBadge');
    if (badgeWrap) badgeWrap.title = tooltip;

    this.currentDatabase = data.database || null;

    // Render environment badge (Distintivo de entorno)
    const badge = document.getElementById('activeEnvBadge');
    if (badge && badgeWrap) {
      badgeWrap.classList.remove('env-accent-dev', 'env-accent-sandbox', 'env-accent-prod');
      badge.classList.remove('env-pill-dev', 'env-pill-sandbox', 'env-pill-prod');

      if (this.currentEnvironment === 'production') {
        badge.textContent = 'PROD';
        badge.className = 'env-pill env-pill-prod';
        badge.title = 'Entorno de Producción';
        badgeWrap.classList.add('env-accent-prod');
        badge.style.display = 'inline-flex';
      } else if (this.currentEnvironment === 'sandbox') {
        badge.textContent = 'SANDBOX';
        badge.className = 'env-pill env-pill-sandbox';
        badge.title = 'Entorno de Sandbox / Pruebas';
        badgeWrap.classList.add('env-accent-sandbox');
        badge.style.display = 'inline-flex';
      } else {
        badge.textContent = 'DEV';
        badge.className = 'env-pill env-pill-dev';
        badge.title = 'Entorno de Desarrollo';
        badgeWrap.classList.add('env-accent-dev');
        badge.style.display = 'inline-flex';
      }
    }
  }

  setDisconnectedState() {
    this.connected = false;
    this.currentEnvironment = null;
    this.statusDot.classList.remove('connected');
    this.connectionText.textContent = 'Desconectado';
    this.connectionText.title = 'Sin conexión activa. Haz clic para conectar.';
    const badge = document.getElementById('activeEnvBadge');
    const badgeWrap = document.getElementById('activeConnectionBadge');
    if (badge) badge.style.display = 'none';
    if (badgeWrap) {
      badgeWrap.classList.remove('env-accent-dev', 'env-accent-sandbox', 'env-accent-prod');
      badgeWrap.title = 'Sin conexión activa. Haz clic para conectar.';
    }
    this.dbSelect.innerHTML = '<option value="">-- Sin Base de Datos --</option>';
    this.schemaTree.setData(null);
  }

  async loadDatabases(selectedDb = null) {
    try {
      const res = await fetch('/api/schema/databases');
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al obtener bases de datos');

      const dbs = data.databases || [];
      let html = '<option value="">-- Seleccionar Base de Datos --</option>';
      dbs.forEach(db => {
        html += `<option value="${db}">${db}</option>`;
      });
      this.dbSelect.innerHTML = html;

      // Select database
      const dbToSelect = selectedDb || dbs.find(d => !['information_schema', 'performance_schema', 'mysql', 'sys'].includes(d)) || dbs[0];
      if (dbToSelect) {
        this.dbSelect.value = dbToSelect;
        await this.switchDatabase(dbToSelect);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async switchDatabase(dbName) {
    this.currentDatabase = dbName;
    try {
      await fetch('/api/session/switch-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ database: dbName })
      });
      await this.loadSchema(dbName);
    } catch (err) {
      console.error('Error switching database', err);
    }
  }

  setSyncSpinning(isSpinning) {
    const btn = document.getElementById('btnRefreshDatabases');
    if (!btn) return;
    if (isSpinning) {
      btn.classList.add('btn-spinning');
      btn.disabled = true;
      btn.querySelectorAll('svg, i').forEach(el => el.classList.add('spin'));
    } else {
      btn.classList.remove('btn-spinning');
      btn.disabled = false;
      btn.querySelectorAll('svg, i, .spin').forEach(el => el.classList.remove('spin'));
    }
  }

  async loadSchema(dbName = null) {
    const targetDb = dbName || this.currentDatabase || this.dbSelect.value;
    if (!targetDb) {
      await this.loadDatabases();
      return;
    }

    this.setSyncSpinning(true);

    try {
      const res = await fetch(`/api/schema/databases/${encodeURIComponent(targetDb)}/objects`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);

      this.currentDatabase = targetDb;
      if (this.dbSelect.value !== targetDb) {
        this.dbSelect.value = targetDb;
      }
      this.schemaTree.setData(data);

      // Update autocomplete in Monaco
      if (typeof updateSchemaCompletions === 'function') {
        updateSchemaCompletions(data.tables || [], data.columns_by_table || {}, data.foreign_keys || []);
      }
    } catch (err) {
      console.error('Error loading schema', err);
    } finally {
      this.setSyncSpinning(false);
      if (window.lucide) lucide.createIcons();
    }
  }

  // --- Tabs Management ---
  createQueryTab(initialSql = '', title = null) {
    const tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const tabTitle = title || `Query ${this.tabCounter++}`;
    const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
    const execHint = isMac ? '⌘ + Enter para ejecutar' : 'Ctrl + Enter para ejecutar';
    const saveHint = isMac ? 'Cmd+S' : 'Ctrl+S';

    const tabItem = document.createElement('div');
    tabItem.className = 'tab-item';
    tabItem.id = `item_${tabId}`;
    tabItem.innerHTML = `
      <i data-lucide="terminal" style="width:13px; height:13px; color:var(--accent);"></i>
      <span class="tab-title">${tabTitle}</span>
      <span class="tab-close" title="Cerrar"><i data-lucide="x" style="width:11px; height:11px;"></i></span>
    `;

    // Pane
    const pane = document.createElement('div');
    pane.className = 'tab-pane';
    pane.id = `pane_${tabId}`;
    pane.innerHTML = `
      <div class="editor-toolbar">
        <div class="editor-toolbar-left">
          <button class="btn btn-primary btn-sm btn-run-query" title="Ejecutar consulta seleccionada o activa (${execHint})">
            <i data-lucide="play" style="width:13px; height:13px;"></i> Ejecutar
          </button>
          <button class="btn btn-sm btn-explain-query" title="Plan EXPLAIN de la consulta seleccionada o activa">
            <i data-lucide="activity" style="width:13px; height:13px;"></i> Explicar
          </button>
          <button class="btn btn-sm btn-format-query">
            <i data-lucide="align-left" style="width:13px; height:13px;"></i> Formatear
          </button>
          <button class="btn btn-sm btn-save-tab-query" title="Guardar consulta en favoritas (${saveHint})">
            <i data-lucide="bookmark" style="width:13px; height:13px;"></i> Guardar
          </button>
        </div>
        <div class="editor-toolbar-right">
          <span>${execHint}</span>
        </div>
      </div>
      <div class="editor-container">
        <div class="monaco-editor-box" id="monaco_${tabId}"></div>
      </div>
    `;

    this.tabsBar.insertBefore(tabItem, this.tabAddBtn);
    this.tabContentArea.appendChild(pane);

    const tabObj = {
      id: tabId,
      type: 'query',
      title: tabTitle,
      tabElement: tabItem,
      paneElement: pane,
      editorInstance: null
    };
    this.tabs.push(tabObj);

    // Initialize Monaco in container
    const monacoBox = pane.querySelector(`#monaco_${tabId}`);
    createEditor(
      monacoBox,
      initialSql || '-- Escribe tu consulta SQL aquí\nSELECT 1;\n',
      (sql) => {
        this.onAutoCollapseTrigger();
        this.queryExec.run(sql, this.currentDatabase);
      },
      (sql) => { this.openSaveQueryModal(tabObj, sql); }
    ).then(editor => {
      tabObj.editorInstance = editor;
    });

    // Toolbar buttons
    pane.querySelector('.btn-run-query').addEventListener('click', () => {
      if (tabObj.editorInstance) {
        const sql = (typeof tabObj.editorInstance.getQueryToRun === 'function')
          ? tabObj.editorInstance.getQueryToRun()
          : (tabObj.editorInstance.getSelectedText() || tabObj.editorInstance.getValue());
        this.onAutoCollapseTrigger();
        this.queryExec.run(sql, this.currentDatabase);
      }
    });

    pane.querySelector('.btn-save-tab-query').addEventListener('click', () => {
      this.openSaveQueryModal(tabObj);
    });

    pane.querySelector('.btn-explain-query').addEventListener('click', () => {
      if (tabObj.editorInstance) {
        const sql = (typeof tabObj.editorInstance.getQueryToRun === 'function')
          ? tabObj.editorInstance.getQueryToRun()
          : (tabObj.editorInstance.getSelectedText() || tabObj.editorInstance.getValue());
        this.onAutoCollapseTrigger();
        this.queryExec.runExplain(sql, this.currentDatabase);
      }
    });

    pane.querySelector('.btn-format-query').addEventListener('click', () => {
      if (tabObj.editorInstance) tabObj.editorInstance.format();
    });

    // Tab activation and close
    tabItem.addEventListener('click', (e) => {
      if (!e.target.closest('.tab-close')) {
        this.activateTab(tabId);
      }
    });

    tabItem.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(tabId);
    });

    if (window.lucide) lucide.createIcons();
    this.activateTab(tabId);
    return tabObj;
  }

  createDataTab(tableOrViewName) {
    const existing = this.tabs.find(t => t.type === 'data' && t.targetName === tableOrViewName);
    if (existing) {
      this.activateTab(existing.id);
      return;
    }

    const tabId = `tab_data_${Date.now()}`;
    const tabItem = document.createElement('div');
    tabItem.className = 'tab-item';
    tabItem.id = `item_${tabId}`;
    tabItem.innerHTML = `
      <i data-lucide="table-properties" style="width:13px; height:13px; color:#60a5fa;"></i>
      <span class="tab-title">Datos: ${tableOrViewName}</span>
      <span class="tab-close"><i data-lucide="x" style="width:11px; height:11px;"></i></span>
    `;

    const pane = document.createElement('div');
    pane.className = 'tab-pane';
    pane.id = `pane_${tabId}`;
    pane.innerHTML = `
      <div class="editor-toolbar">
        <div class="editor-toolbar-left">
          <button class="btn btn-sm btn-refresh-data"><i data-lucide="refresh-cw"></i> Actualizar</button>
          <input type="text" class="search-box table-filter-input" placeholder="Buscar en tabla..." style="max-width:240px;">
        </div>
        <div class="editor-toolbar-right">
          <span class="table-data-stats"></span>
        </div>
      </div>
      <div class="data-table-wrap" style="flex:1;">
        <table class="data-table live-table">
          <thead></thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="pagination-bar">
        <div class="table-page-info">Cargando...</div>
        <div class="page-controls">
          <button class="btn btn-sm btn-table-prev">Anterior</button>
          <span class="table-page-num" style="padding:0 6px; font-weight:600;">1</span>
          <button class="btn btn-sm btn-table-next">Siguiente</button>
        </div>
      </div>
    `;

    this.tabsBar.insertBefore(tabItem, this.tabAddBtn);
    this.tabContentArea.appendChild(pane);

    const tabObj = {
      id: tabId,
      type: 'data',
      targetName: tableOrViewName,
      tabElement: tabItem,
      paneElement: pane,
      page: 1,
      pageSize: 50,
      search: '',
      sortBy: null,
      sortDir: 'ASC'
    };
    this.tabs.push(tabObj);

    // Event handlers for data tab
    const loadData = async () => {
      const stats = pane.querySelector('.table-data-stats');
      const pageInfo = pane.querySelector('.table-page-info');
      const pageNum = pane.querySelector('.table-page-num');
      const prevBtn = pane.querySelector('.btn-table-prev');
      const nextBtn = pane.querySelector('.btn-table-next');
      const thead = pane.querySelector('thead');
      const tbody = pane.querySelector('tbody');

      stats.textContent = 'Cargando...';
      try {
        const url = `/api/schema/databases/${encodeURIComponent(this.currentDatabase)}/tables/${encodeURIComponent(tableOrViewName)}/data?page=${tabObj.page}&page_size=${tabObj.pageSize}&sort_dir=${tabObj.sortDir}${tabObj.sortBy ? `&sort_by=${encodeURIComponent(tabObj.sortBy)}` : ''}${tabObj.search ? `&search=${encodeURIComponent(tabObj.search)}` : ''}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);

        stats.textContent = `${data.total_rows} filas totales`;
        pageInfo.textContent = `Página ${data.page} de ${data.total_pages || 1} (${data.rows.length} en pantalla)`;
        pageNum.textContent = data.page;
        prevBtn.disabled = data.page <= 1;
        nextBtn.disabled = data.page >= data.total_pages;

        // Render Head
        thead.innerHTML = `<tr><th style="width:40px; text-align:center;">#</th>${data.columns.map(c => `<th>${c}</th>`).join('')}</tr>`;

        // Render Body
        tbody.innerHTML = data.rows.map((row, rIdx) => `
          <tr>
            <td style="text-align:center; color:var(--text-dim);">${(data.page - 1) * data.page_size + rIdx + 1}</td>
            ${row.map(v => `<td>${v === null ? '<span class="null-badge">NULL</span>' : v}</td>`).join('')}
          </tr>
        `).join('');
      } catch (err) {
        stats.textContent = `Error: ${err.message}`;
      }
    };

    pane.querySelector('.btn-refresh-data').addEventListener('click', loadData);
    pane.querySelector('.btn-table-prev').addEventListener('click', () => {
      if (tabObj.page > 1) {
        tabObj.page--;
        loadData();
      }
    });
    pane.querySelector('.btn-table-next').addEventListener('click', () => {
      tabObj.page++;
      loadData();
    });

    const searchInput = pane.querySelector('.table-filter-input');
    searchInput.addEventListener('change', (e) => {
      tabObj.search = e.target.value;
      tabObj.page = 1;
      loadData();
    });

    tabItem.addEventListener('click', (e) => {
      if (!e.target.closest('.tab-close')) this.activateTab(tabId);
    });
    tabItem.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(tabId);
    });

    if (window.lucide) lucide.createIcons();
    this.activateTab(tabId);
    loadData();
  }

  createDdlTab(type, name) {
    const existing = this.tabs.find(t => t.type === 'ddl' && t.targetName === name);
    if (existing) {
      this.activateTab(existing.id);
      return;
    }

    const tabId = `tab_ddl_${Date.now()}`;
    const tabItem = document.createElement('div');
    tabItem.className = 'tab-item';
    tabItem.id = `item_${tabId}`;
    tabItem.innerHTML = `
      <i data-lucide="file-code" style="width:13px; height:13px; color:#34d399;"></i>
      <span class="tab-title">DDL: ${name}</span>
      <span class="tab-close"><i data-lucide="x" style="width:11px; height:11px;"></i></span>
    `;

    const pane = document.createElement('div');
    pane.className = 'tab-pane';
    pane.id = `pane_${tabId}`;
    pane.innerHTML = `
      <div class="editor-toolbar">
        <div class="editor-toolbar-left">
          <span style="font-weight:600; color:#34d399;">Definición DDL (${type.toUpperCase()}): ${name}</span>
        </div>
        <div class="editor-toolbar-right">
          <button class="btn btn-sm btn-copy-ddl"><i data-lucide="copy"></i> Copiar DDL</button>
          <button class="btn btn-sm btn-edit-ddl"><i data-lucide="edit-3"></i> Abrir en Editor</button>
        </div>
      </div>
      <pre class="ddl-viewer">Cargando definición DDL...</pre>
    `;

    this.tabsBar.insertBefore(tabItem, this.tabAddBtn);
    this.tabContentArea.appendChild(pane);

    const tabObj = {
      id: tabId,
      type: 'ddl',
      targetName: name,
      tabElement: tabItem,
      paneElement: pane,
      ddlText: ''
    };
    this.tabs.push(tabObj);

    // Fetch DDL
    fetch(`/api/schema/databases/${encodeURIComponent(this.currentDatabase)}/objects/${encodeURIComponent(type)}/${encodeURIComponent(name)}/ddl`)
      .then(r => r.json())
      .then(data => {
        tabObj.ddlText = data.ddl || '-- No se encontró DDL';
        pane.querySelector('.ddl-viewer').textContent = tabObj.ddlText;
      })
      .catch(err => {
        pane.querySelector('.ddl-viewer').textContent = `-- Error al cargar DDL: ${err.message}`;
      });

    pane.querySelector('.btn-copy-ddl').addEventListener('click', () => {
      navigator.clipboard.writeText(tabObj.ddlText);
      alert('DDL copiado al portapapeles');
    });

    pane.querySelector('.btn-edit-ddl').addEventListener('click', () => {
      this.createQueryTab(tabObj.ddlText, `Editar ${name}`);
    });

    tabItem.addEventListener('click', (e) => {
      if (!e.target.closest('.tab-close')) this.activateTab(tabId);
    });
    tabItem.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(tabId);
    });

    if (window.lucide) lucide.createIcons();
    this.activateTab(tabId);
  }

  activateTab(tabId) {
    this.activeTabId = tabId;
    this.tabs.forEach(t => {
      const isActive = t.id === tabId;
      t.tabElement.classList.toggle('active', isActive);
      t.paneElement.classList.toggle('active', isActive);
      if (isActive && t.editorInstance) {
        setTimeout(() => t.editorInstance.layout(), 10);
      }
    });
  }

  closeTab(tabId) {
    const idx = this.tabs.findIndex(t => t.id === tabId);
    if (idx === -1) return;

    const tab = this.tabs[idx];
    if (tab.editorInstance) tab.editorInstance.destroy();
    tab.tabElement.remove();
    tab.paneElement.remove();
    this.tabs.splice(idx, 1);

    if (this.activeTabId === tabId) {
      if (this.tabs.length > 0) {
        const nextIdx = Math.max(0, idx - 1);
        this.activateTab(this.tabs[nextIdx].id);
      } else {
        this.createQueryTab();
      }
    }
  }

  // --- Schema Actions Handler ---
  handleSchemaAction(action, payload) {
    if (['view_data', 'view_ddl', 'edit_procedure', 'generate_select', 'generate_call_func', 'run_procedure'].includes(action)) {
      this.onAutoCollapseTrigger();
    }

    if (action === 'refresh_schema') {
      this.loadSchema(this.currentDatabase);
    } else if (action === 'view_data') {
      this.createDataTab(payload.name);
    } else if (action === 'view_ddl') {
      this.createDdlTab(payload.type, payload.name);
    } else if (action === 'edit_procedure') {
      this.openProcedureEditor(payload.name);
    } else if (action === 'generate_select') {
      const sql = `SELECT * FROM ${payload.name} LIMIT 100;\n`;
      const activeTab = this.tabs.find(t => t.id === this.activeTabId && t.type === 'query');
      if (activeTab && activeTab.editorInstance) {
        activeTab.editorInstance.setValue(sql);
      } else {
        this.createQueryTab(sql, `SELECT ${payload.name}`);
      }
    } else if (action === 'generate_call_func') {
      const sql = `SELECT ${payload.name}();\n`;
      const activeTab = this.tabs.find(t => t.id === this.activeTabId && t.type === 'query');
      if (activeTab && activeTab.editorInstance) {
        activeTab.editorInstance.setValue(sql);
      } else {
        this.createQueryTab(sql, `CALL ${payload.name}`);
      }
    } else if (action === 'run_procedure') {
      this.procModal.open(this.currentDatabase, payload.name);
    }
  }

  async openProcedureEditor(name) {
    const existing = this.tabs.find(t => 
      t.targetProcedure === name || t.title === `Editar: ${name}` || t.title === `Editar ${name}`
    );
    if (existing) {
      this.activateTab(existing.id);
      return;
    }

    try {
      const res = await fetch(`/api/schema/databases/${encodeURIComponent(this.currentDatabase)}/objects/PROCEDURE/${encodeURIComponent(name)}/ddl`);
      const data = await res.json();
      const rawDdl = (data && data.ddl) ? data.ddl.trim() : '';

      let initialSql = '';
      if (rawDdl) {
        initialSql = `DROP PROCEDURE IF EXISTS \`${name}\`;\n\n${rawDdl};\n`;
      } else {
        initialSql = `-- Procedimiento: ${name}\n-- No se encontró la definición DDL\n`;
      }

      const tabObj = this.createQueryTab(initialSql, `Editar: ${name}`);
      if (tabObj) {
        tabObj.targetProcedure = name;
        const icon = tabObj.tabElement.querySelector('i');
        if (icon) {
          icon.setAttribute('data-lucide', 'file-code');
          icon.style.color = '#34d399';
          if (window.lucide) lucide.createIcons();
        }
      }
    } catch (err) {
      console.error('Error al abrir editor de procedimiento:', err);
      const tabObj = this.createQueryTab(`-- Error al cargar procedimiento ${name}: ${err.message}`, `Editar: ${name}`);
      if (tabObj) tabObj.targetProcedure = name;
    }
  }

  // --- Connections Manager ---
  async openConnectionsModal() {
    document.getElementById('modalConnections')?.classList.add('open');
    await this.loadSavedConnectionsList();
  }

  closeConnectionsModal() {
    document.getElementById('modalConnections')?.classList.remove('open');
  }

  async loadSavedConnectionsList() {
    try {
      const res = await fetch('/api/connections');
      const list = await res.json();
      const container = document.getElementById('savedConnList');
      if (!list.length) {
        container.innerHTML = '<div style="font-size:11px; color:var(--text-dim); padding:10px 0;">Sin conexiones guardadas</div>';
        return;
      }

      container.innerHTML = list.map(c => {
        const env = c.environment || 'development';
        let pillClass = 'env-pill-dev';
        let pillText = 'DESARROLLO';
        if (env === 'production') {
          pillClass = 'env-pill-prod';
          pillText = 'PRODUCCIÓN';
        } else if (env === 'sandbox') {
          pillClass = 'env-pill-sandbox';
          pillText = 'SANDBOX';
        }

        return `
          <div class="conn-card" data-id="${c.id}">
            <div style="overflow:hidden; display:flex; flex-direction:column; gap:4px;">
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-weight:600; font-size:12px; color:#fff;">${c.name}</span>
                <span class="env-pill ${pillClass}">${pillText}</span>
              </div>
              <div style="font-size:11px; color:var(--text-dim);">${c.user}@${c.host}:${c.port}</div>
            </div>
            <i data-lucide="chevron-right" style="width:14px; height:14px; color:var(--text-dim); flex-shrink:0;"></i>
          </div>
        `;
      }).join('');

      container.querySelectorAll('.conn-card').forEach(card => {
        card.addEventListener('click', () => {
          container.querySelectorAll('.conn-card').forEach(c => c.classList.remove('active'));
          card.classList.add('active');
          const conn = list.find(c => c.id === card.dataset.id);
          if (conn) this.populateConnForm(conn);
        });
      });

      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.error(err);
    }
  }

  populateConnForm(c) {
    document.getElementById('connFormId').value = c.id || '';
    document.getElementById('connFormName').value = c.name || '';
    document.getElementById('connFormHost').value = c.host || '127.0.0.1';
    document.getElementById('connFormPort').value = c.port || 3306;
    document.getElementById('connFormUser').value = c.user || 'root';
    document.getElementById('connFormPassword').value = c.password || '';
    document.getElementById('connFormDatabase').value = c.database || '';
    document.getElementById('connFormEnvironment').value = c.environment || 'development';
    document.getElementById('connFormSsl').checked = !!c.ssl;
    document.getElementById('btnDeleteConn').style.display = 'inline-flex';
    document.getElementById('connTestResult').innerHTML = '';
  }

  resetConnForm() {
    document.getElementById('connFormId').value = '';
    document.getElementById('connFormName').value = 'Nueva Conexión MySQL';
    document.getElementById('connFormHost').value = '127.0.0.1';
    document.getElementById('connFormPort').value = '3306';
    document.getElementById('connFormUser').value = 'root';
    document.getElementById('connFormPassword').value = '';
    document.getElementById('connFormDatabase').value = '';
    document.getElementById('connFormEnvironment').value = 'development';
    document.getElementById('connFormSsl').checked = false;
    document.getElementById('btnDeleteConn').style.display = 'none';
    document.getElementById('connTestResult').innerHTML = '';
  }

  getConnFormData() {
    return {
      id: document.getElementById('connFormId').value || undefined,
      name: document.getElementById('connFormName').value || 'MySQL',
      host: document.getElementById('connFormHost').value || '127.0.0.1',
      port: parseInt(document.getElementById('connFormPort').value, 10) || 3306,
      user: document.getElementById('connFormUser').value || 'root',
      password: document.getElementById('connFormPassword').value || '',
      database: document.getElementById('connFormDatabase').value || '',
      environment: document.getElementById('connFormEnvironment').value || 'development',
      ssl: document.getElementById('connFormSsl').checked
    };
  }

  async testConnectionForm() {
    const data = this.getConnFormData();
    const resultBox = document.getElementById('connTestResult');
    resultBox.innerHTML = '<span style="color:var(--text-muted);">Probando conexión...</span>';

    try {
      const res = await fetch('/api/connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      if (result.success) {
        resultBox.innerHTML = `<span style="color:var(--success);">✓ ${result.message}</span>`;
      } else {
        resultBox.innerHTML = `<span style="color:var(--danger);">✗ ${result.message}</span>`;
      }
    } catch (err) {
      resultBox.innerHTML = `<span style="color:var(--danger);">✗ Error: ${err.message}</span>`;
    }
  }

  async saveConnectionForm(andConnect = false) {
    const data = this.getConnFormData();
    const resultBox = document.getElementById('connTestResult');

    try {
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const saved = await res.json();
      if (!res.ok) throw new Error(saved.detail || 'Error al guardar');

      await this.loadSavedConnectionsList();

      if (andConnect) {
        resultBox.innerHTML = '<span style="color:var(--text-muted);">Conectando...</span>';
        const connRes = await fetch('/api/session/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connection_id: saved.id })
        });
        const connData = await connRes.json();
        if (!connRes.ok) throw new Error(connData.detail || 'Error al conectar');

        this.setConnectedState(connData);
        await this.loadDatabases(connData.database);
        this.closeConnectionsModal();
      } else {
        resultBox.innerHTML = '<span style="color:var(--success);">✓ Conexión guardada con éxito</span>';
      }
    } catch (err) {
      resultBox.innerHTML = `<span style="color:var(--danger);">✗ ${err.message}</span>`;
    }
  }

  async deleteCurrentConnection() {
    const id = document.getElementById('connFormId').value;
    if (!id || !confirm('¿Estás seguro de eliminar esta conexión guardada?')) return;

    try {
      await fetch(`/api/connections/${id}`, { method: 'DELETE' });
      this.resetConnForm();
      await this.loadSavedConnectionsList();
    } catch (err) {
      alert(`Error al eliminar: ${err.message}`);
    }
  }

  // --- Query Type Badge Helper ---
  getQueryTypeBadge(type = 'SELECT') {
    const t = (type || 'SELECT').toUpperCase();
    let cls = 'badge-other';
    if (t === 'SELECT') cls = 'badge-select';
    else if (t === 'UPDATE') cls = 'badge-update';
    else if (t === 'DELETE') cls = 'badge-delete';
    else if (t === 'INSERT') cls = 'badge-insert';
    else if (['CREATE', 'ALTER', 'DROP', 'TRUNCATE'].includes(t)) cls = 'badge-ddl';
    return `<span class="badge ${cls}">${t}</span>`;
  }

  // --- Saved Queries Management ---
  openSaveQueryModal(tabObj = null, sql = null) {
    const activeTab = tabObj || this.tabs.find(t => t.id === this.activeTabId && t.type === 'query');
    let querySql = sql;
    if (!querySql && activeTab && activeTab.editorInstance) {
      querySql = activeTab.editorInstance.getSelectedText() || activeTab.editorInstance.getValue();
    }
    querySql = querySql || '';

    document.getElementById('saveQueryId').value = '';
    document.getElementById('saveQueryTitle').value = activeTab ? activeTab.title : '';
    document.getElementById('saveQueryDatabase').value = this.currentDatabase || '';
    document.getElementById('saveQueryTextPreview').value = querySql.trim();

    document.getElementById('modalSaveQuery')?.classList.add('open');
    setTimeout(() => document.getElementById('saveQueryTitle')?.focus(), 50);
  }

  closeSaveQueryModal() {
    document.getElementById('modalSaveQuery')?.classList.remove('open');
  }

  async saveCurrentQuery() {
    const title = document.getElementById('saveQueryTitle').value.trim();
    const query_text = document.getElementById('saveQueryTextPreview').value.trim();
    const database_name = document.getElementById('saveQueryDatabase').value.trim();
    const qid = document.getElementById('saveQueryId').value || undefined;

    if (!title) {
      alert('Por favor ingresa un título para la consulta.');
      return;
    }
    if (!query_text) {
      alert('La consulta SQL no puede estar vacía.');
      return;
    }

    try {
      const res = await fetch('/api/query/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: qid, title, query_text, database_name })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al guardar la consulta');

      this.closeSaveQueryModal();
      this.queryExec.logMessage(`Consulta "${title}" guardada con éxito.`, 'success');
      if (document.getElementById('modalSavedQueries')?.classList.contains('open')) {
        await this.loadSavedQueries();
      }
    } catch (err) {
      alert(`Error al guardar: ${err.message}`);
    }
  }

  async openSavedQueriesModal() {
    document.getElementById('modalSavedQueries')?.classList.add('open');
    await this.loadSavedQueries();
  }

  closeSavedQueriesModal() {
    document.getElementById('modalSavedQueries')?.classList.remove('open');
  }

  async loadSavedQueries() {
    const container = document.getElementById('savedQueriesListContainer');
    container.innerHTML = '<div style="padding:15px; color:var(--text-muted);">Cargando consultas guardadas...</div>';

    try {
      const res = await fetch('/api/query/saved');
      this.savedQueriesCache = await res.json();
      this.renderSavedQueriesList(this.savedQueriesCache);
    } catch (err) {
      container.innerHTML = `<div class="msg-entry msg-error">Error: ${err.message}</div>`;
    }
  }

  filterSavedQueries(text) {
    if (!this.savedQueriesCache) return;
    const q = (text || '').toLowerCase();
    const filtered = this.savedQueriesCache.filter(item => 
      (item.title || '').toLowerCase().includes(q) ||
      (item.database_name || '').toLowerCase().includes(q) ||
      (item.query_text || '').toLowerCase().includes(q)
    );
    this.renderSavedQueriesList(filtered);
  }

  renderSavedQueriesList(list) {
    const container = document.getElementById('savedQueriesListContainer');
    if (!list || !list.length) {
      container.innerHTML = `
        <div class="empty-state" style="padding:30px;">
          <i data-lucide="bookmark" class="empty-state-icon"></i>
          <p>No tienes consultas guardadas aún.</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    container.innerHTML = list.map(item => `
      <div class="history-entry-card" data-qid="${item.id}">
        <div class="history-card-header">
          <div class="history-card-meta">
            <span style="font-weight:600; font-size:13px; color:#fff;">${item.title}</span>
            ${item.database_name ? `<span class="badge-db">📁 ${item.database_name}</span>` : ''}
            <span style="color:var(--text-dim); font-size:11px;">${new Date(item.created_at).toLocaleString()}</span>
          </div>
          <button class="btn btn-sm btn-danger btn-delete-saved" data-qid="${item.id}" title="Eliminar consulta">
            <i data-lucide="trash-2" style="width:12px; height:12px;"></i>
          </button>
        </div>
        <pre class="history-card-sql">${item.query_text}</pre>
        <div class="history-card-actions">
          <button class="btn btn-sm btn-copy-saved" data-sql="${encodeURIComponent(item.query_text)}">
            <i data-lucide="copy" style="width:12px; height:12px;"></i> Copiar
          </button>
          <button class="btn btn-sm btn-primary btn-load-saved" data-sql="${encodeURIComponent(item.query_text)}" data-db="${encodeURIComponent(item.database_name || '')}" data-title="${encodeURIComponent(item.title)}">
            <i data-lucide="corner-down-left" style="width:12px; height:12px;"></i> Cargar en Editor
          </button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.btn-load-saved').forEach(btn => {
      btn.addEventListener('click', async () => {
        const sql = decodeURIComponent(btn.dataset.sql);
        const db = decodeURIComponent(btn.dataset.db);
        const title = decodeURIComponent(btn.dataset.title);

        if (db && db !== this.currentDatabase) {
          await this.switchDatabase(db);
        }

        const activeTab = this.tabs.find(t => t.id === this.activeTabId && t.type === 'query');
        if (activeTab && activeTab.editorInstance) {
          activeTab.editorInstance.setValue(sql);
        } else {
          this.createQueryTab(sql, title);
        }
        this.closeSavedQueriesModal();
      });
    });

    container.querySelectorAll('.btn-copy-saved').forEach(btn => {
      btn.addEventListener('click', () => {
        const sql = decodeURIComponent(btn.dataset.sql);
        navigator.clipboard.writeText(sql);
        alert('Consulta copiada al portapapeles');
      });
    });

    container.querySelectorAll('.btn-delete-saved').forEach(btn => {
      btn.addEventListener('click', () => {
        this.deleteSavedQuery(btn.dataset.qid);
      });
    });

    if (window.lucide) lucide.createIcons();
  }

  async deleteSavedQuery(qid) {
    if (!confirm('¿Estás seguro de eliminar esta consulta guardada?')) return;
    try {
      await fetch(`/api/query/saved/${qid}`, { method: 'DELETE' });
      await this.loadSavedQueries();
    } catch (err) {
      alert(`Error al eliminar: ${err.message}`);
    }
  }

  // --- Query Audit History (SELECT, UPDATE, DELETE, etc.) ---
  async openHistoryModal() {
    document.getElementById('modalHistory')?.classList.add('open');

    // Populate database filter dropdown
    const dbFilter = document.getElementById('historyDbFilter');
    if (dbFilter) {
      let options = '<option value="ALL">Todas las bases</option>';
      Array.from(this.dbSelect.options).forEach(opt => {
        if (opt.value) options += `<option value="${opt.value}">${opt.value}</option>`;
      });
      dbFilter.innerHTML = options;
    }

    await this.loadHistoryModal();
  }

  closeHistoryModal() {
    document.getElementById('modalHistory')?.classList.remove('open');
  }

  async loadHistoryModal() {
    const container = document.getElementById('historyListContainer');
    container.innerHTML = '<div style="padding:15px; color:var(--text-muted);">Cargando registro de consultas...</div>';

    const type = document.getElementById('historyTypeFilter')?.value || 'ALL';
    const db = document.getElementById('historyDbFilter')?.value || 'ALL';
    const search = document.getElementById('historySearchInput')?.value || '';

    try {
      const url = `/api/query/history?limit=300${type !== 'ALL' ? `&query_type=${encodeURIComponent(type)}` : ''}${db !== 'ALL' ? `&database=${encodeURIComponent(db)}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`;
      const res = await fetch(url);
      const list = await res.json();

      if (!list || !list.length) {
        container.innerHTML = `
          <div class="empty-state" style="padding:30px;">
            <i data-lucide="history" class="empty-state-icon"></i>
            <p>No se encontraron consultas registradas con los filtros seleccionados.</p>
          </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
      }

      container.innerHTML = list.map(item => `
        <div class="history-entry-card">
          <div class="history-card-header">
            <div class="history-card-meta">
              ${this.getQueryTypeBadge(item.query_type)}
              <span class="badge-db">📁 ${item.database_name || '(sin base activa)'}</span>
              <span style="color:var(--text-dim); font-size:11px;">${new Date(item.executed_at).toLocaleString()}</span>
              <span style="font-weight:600; color:#38bdf8;">⚡ ${item.duration_ms} ms</span>
              <span class="badge ${item.status === 'SUCCESS' ? 'badge-out' : 'badge-in'}">${item.status}</span>
              ${item.rows_affected !== undefined ? `<span style="color:var(--text-muted); font-size:11px;">${item.rows_affected} fila(s)</span>` : ''}
            </div>
          </div>
          <pre class="history-card-sql">${item.query_text}</pre>
          ${item.error_message ? `<div class="msg-entry msg-error" style="margin-bottom:8px; font-size:11px;">${item.error_message}</div>` : ''}
          <div class="history-card-actions">
            <button class="btn btn-sm btn-copy-history-query" data-sql="${encodeURIComponent(item.query_text)}">
              <i data-lucide="copy" style="width:12px; height:12px;"></i> Copiar
            </button>
            <button class="btn btn-sm btn-load-history-query" data-sql="${encodeURIComponent(item.query_text)}" data-db="${encodeURIComponent(item.database_name || '')}">
              <i data-lucide="corner-down-left" style="width:12px; height:12px;"></i> Cargar en Editor
            </button>
          </div>
        </div>
      `).join('');

      container.querySelectorAll('.btn-load-history-query').forEach(btn => {
        btn.addEventListener('click', async () => {
          const sql = decodeURIComponent(btn.dataset.sql);
          const db = decodeURIComponent(btn.dataset.db);
          if (db && db !== this.currentDatabase) {
            await this.switchDatabase(db);
          }
          const activeTab = this.tabs.find(t => t.id === this.activeTabId && t.type === 'query');
          if (activeTab && activeTab.editorInstance) {
            activeTab.editorInstance.setValue(sql);
          } else {
            this.createQueryTab(sql);
          }
          this.closeHistoryModal();
        });
      });

      container.querySelectorAll('.btn-copy-history-query').forEach(btn => {
        btn.addEventListener('click', () => {
          const sql = decodeURIComponent(btn.dataset.sql);
          navigator.clipboard.writeText(sql);
          alert('Consulta copiada al portapapeles');
        });
      });

      if (window.lucide) lucide.createIcons();
    } catch (err) {
      container.innerHTML = `<div class="msg-entry msg-error">Error: ${err.message}</div>`;
    }
  }

  async clearHistory() {
    if (!confirm('¿Deseas vaciar todo el registro de auditoría de consultas?')) return;
    try {
      await fetch('/api/query/history', { method: 'DELETE' });
      await this.loadHistoryModal();
    } catch (err) {
      console.error(err);
    }
  }
}

// Instantiate app on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
