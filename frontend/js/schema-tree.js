// Schema Tree Navigation and Object Inspector

class SchemaTree {
  constructor(containerId, onSelectObject) {
    this.container = document.getElementById(containerId);
    this.onSelectObject = onSelectObject;
    this.currentData = null;
    this.filterText = '';
    this.expandedGroups = new Set(); // Initially empty -> All groups start collapsed!

    const filterInput = document.getElementById('schemaFilterInput');
    if (filterInput) {
      filterInput.addEventListener('input', (e) => {
        this.filterText = e.target.value.toLowerCase();
        this.render();
      });
    }
  }

  setData(data) {
    this.currentData = data;
    this.render();
  }

  render() {
    if (!this.currentData) {
      this.container.innerHTML = `
        <div class="empty-state">
          <i data-lucide="database-zap" class="empty-state-icon"></i>
          <p>Selecciona una base de datos para ver sus objetos</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    const { database, tables, views, procedures, functions, triggers } = this.currentData;

    // Filter items
    const matchesFilter = (name) => !this.filterText || name.toLowerCase().includes(this.filterText);

    const fTables = tables.filter(t => matchesFilter(t.name));
    const fViews = views.filter(v => matchesFilter(v.name));
    const fProcedures = procedures.filter(p => matchesFilter(p.name));
    const fFunctions = functions.filter(f => matchesFilter(f.name));
    const fTriggers = triggers.filter(tr => matchesFilter(tr.name));

    let html = '';

    const columnsByTable = this.currentData.columns_by_table || {};

    // 1. Tables Group
    html += this.renderGroup(
      'tables',
      'Tablas',
      'table',
      fTables.length,
      tables.length,
      fTables.map(t => {
        const cols = columnsByTable[t.name] || [];
        let tooltip = `Tabla: ${t.name} (${t.approx_rows ?? 0} filas aprox)`;
        if (cols.length > 0) {
          tooltip += `\n\nColumnas (${cols.length}):\n` + cols.map((c, i) => ` ${i + 1}. ${c.name} : ${(c.full_type || c.data_type || '').toUpperCase()}`).join('\n');
        }
        return `
        <div class="tree-item" data-type="table" data-name="${t.name}">
          <div class="tree-item-name" title="${tooltip}">
            <i data-lucide="table" style="width:13px; height:13px; color:#60a5fa;"></i>
            <span>${t.name}</span>
          </div>
          <div class="tree-item-actions">
            <button class="action-icon act-data" title="Ver Datos"><i data-lucide="eye" style="width:12px; height:12px;"></i></button>
            <button class="action-icon act-ddl" title="Ver DDL"><i data-lucide="code" style="width:12px; height:12px;"></i></button>
            <button class="action-icon act-query" title="Generar SELECT"><i data-lucide="file-plus" style="width:12px; height:12px;"></i></button>
          </div>
        </div>
      `;
      }).join('')
    );

    // 2. Views Group
    html += this.renderGroup(
      'views',
      'Vistas',
      'layers',
      fViews.length,
      views.length,
      fViews.map(v => `
        <div class="tree-item" data-type="view" data-name="${v.name}">
          <div class="tree-item-name" title="${v.name}">
            <i data-lucide="layers" style="width:13px; height:13px; color:#c084fc;"></i>
            <span>${v.name}</span>
          </div>
          <div class="tree-item-actions">
            <button class="action-icon act-data" title="Ver Datos"><i data-lucide="eye" style="width:12px; height:12px;"></i></button>
            <button class="action-icon act-ddl" title="Ver DDL"><i data-lucide="code" style="width:12px; height:12px;"></i></button>
          </div>
        </div>
      `).join('')
    );

    // 3. Stored Procedures Group
    html += this.renderGroup(
      'procedures',
      'Procedimientos',
      'play-circle',
      fProcedures.length,
      procedures.length,
      fProcedures.map(p => `
        <div class="tree-item" data-type="procedure" data-name="${p.name}">
          <div class="tree-item-name" title="${p.name}">
            <i data-lucide="play-circle" style="width:13px; height:13px; color:#34d399;"></i>
            <span>${p.name}</span>
          </div>
          <div class="tree-item-actions">
            <button class="action-icon act-run-proc" title="Ejecutar"><i data-lucide="play" style="width:12px; height:12px;"></i></button>
            <button class="action-icon act-ddl" title="Ver DDL"><i data-lucide="code" style="width:12px; height:12px;"></i></button>
          </div>
        </div>
      `).join('')
    );

    // 4. Stored Functions Group
    html += this.renderGroup(
      'functions',
      'Funciones',
      'variable',
      fFunctions.length,
      functions.length,
      fFunctions.map(f => `
        <div class="tree-item" data-type="function" data-name="${f.name}">
          <div class="tree-item-name" title="${f.name} -> ${f.return_type || ''}">
            <i data-lucide="variable" style="width:13px; height:13px; color:#f59e0b;"></i>
            <span>${f.name}</span>
          </div>
          <div class="tree-item-actions">
            <button class="action-icon act-call-func" title="Generar Llamada"><i data-lucide="file-plus" style="width:12px; height:12px;"></i></button>
            <button class="action-icon act-ddl" title="Ver DDL"><i data-lucide="code" style="width:12px; height:12px;"></i></button>
          </div>
        </div>
      `).join('')
    );

    // 5. Triggers Group
    html += this.renderGroup(
      'triggers',
      'Triggers',
      'zap',
      fTriggers.length,
      triggers.length,
      fTriggers.map(tr => `
        <div class="tree-item" data-type="trigger" data-name="${tr.name}">
          <div class="tree-item-name" title="${tr.name} (${tr.timing} ${tr.event} ON ${tr.table_name})">
            <i data-lucide="zap" style="width:13px; height:13px; color:#f43f5e;"></i>
            <span>${tr.name}</span>
          </div>
          <div class="tree-item-actions">
            <button class="action-icon act-ddl" title="Ver DDL"><i data-lucide="code" style="width:12px; height:12px;"></i></button>
          </div>
        </div>
      `).join('')
    );

    this.container.innerHTML = html;
    if (window.lucide) lucide.createIcons();

    // Attach event listeners
    this.attachEvents();
  }

  renderGroup(groupId, label, iconName, count, totalCount, childrenHtml) {
    const isFiltered = count !== totalCount;
    const badgeText = isFiltered ? `${count}/${totalCount}` : totalCount;

    // Initially all groups start collapsed unless search filter is active or user expanded them
    const isExpanded = (this.filterText && count > 0) || this.expandedGroups.has(groupId);
    const chevronIcon = isExpanded ? 'chevron-down' : 'chevron-right';
    const displayStyle = isExpanded ? 'display:flex;' : 'display:none;';

    return `
      <div class="tree-group" id="group-${groupId}">
        <div class="tree-group-header" data-group="${groupId}">
          <div class="title-wrap">
            <i data-lucide="${chevronIcon}" class="group-chevron" style="width:14px; height:14px;"></i>
            <i data-lucide="${iconName}" style="width:14px; height:14px; color:var(--text-muted);"></i>
            <span>${label}</span>
          </div>
          <div style="display:flex; align-items:center; gap:5px;">
            <button class="action-icon tree-group-refresh-btn" data-refresh="${groupId}" title="Recargar ${label}" style="display:flex; align-items:center;">
              <i data-lucide="refresh-cw" style="width:11px; height:11px;"></i>
            </button>
            <span class="tree-badge">${badgeText}</span>
          </div>
        </div>
        <div class="tree-children" id="children-${groupId}" style="${displayStyle}">
          ${childrenHtml || '<div style="padding:4px 12px; font-size:11px; color:var(--text-dim);">Sin elementos</div>'}
        </div>
      </div>
    `;
  }

  attachEvents() {
    // Group refresh button
    this.container.querySelectorAll('.tree-group-refresh-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const icon = btn.querySelector('i');
        if (icon) icon.classList.add('spin');
        if (this.onSelectObject) {
          this.onSelectObject('refresh_schema', { group: btn.dataset.refresh });
        }
      });
    });

    // Group accordion toggle
    this.container.querySelectorAll('.tree-group-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('.tree-group-refresh-btn')) return;
        const groupId = header.dataset.group;
        const children = document.getElementById(`children-${groupId}`);
        const chevron = header.querySelector('.group-chevron');
        if (children) {
          const isCurrentlyHidden = children.style.display === 'none';
          if (isCurrentlyHidden) {
            children.style.display = 'flex';
            this.expandedGroups.add(groupId);
            if (chevron) chevron.setAttribute('data-lucide', 'chevron-down');
          } else {
            children.style.display = 'none';
            this.expandedGroups.delete(groupId);
            if (chevron) chevron.setAttribute('data-lucide', 'chevron-right');
          }
          if (window.lucide) lucide.createIcons();
        }
      });
    });

    // Item click & action clicks
    this.container.querySelectorAll('.tree-item').forEach(item => {
      const type = item.dataset.type;
      const name = item.dataset.name;

      item.addEventListener('dblclick', () => {
        if (type === 'table' || type === 'view') {
          if (this.onSelectObject) this.onSelectObject('view_data', { type, name });
        } else if (type === 'procedure') {
          if (this.onSelectObject) this.onSelectObject('run_procedure', { name });
        } else {
          if (this.onSelectObject) this.onSelectObject('view_ddl', { type, name });
        }
      });

      // Actions inside item
      const actData = item.querySelector('.act-data');
      if (actData) {
        actData.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.onSelectObject) this.onSelectObject('view_data', { type, name });
        });
      }

      const actDdl = item.querySelector('.act-ddl');
      if (actDdl) {
        actDdl.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.onSelectObject) this.onSelectObject('view_ddl', { type, name });
        });
      }

      const actQuery = item.querySelector('.act-query');
      if (actQuery) {
        actQuery.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.onSelectObject) this.onSelectObject('generate_select', { name });
        });
      }

      const actRunProc = item.querySelector('.act-run-proc');
      if (actRunProc) {
        actRunProc.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.onSelectObject) this.onSelectObject('run_procedure', { name });
        });
      }

      const actCallFunc = item.querySelector('.act-call-func');
      if (actCallFunc) {
        actCallFunc.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.onSelectObject) this.onSelectObject('generate_call_func', { name });
        });
      }
    });
  }
}
