const API_BASE = 'http://localhost:8880/api';

let state = {
  plans: [],
  meta: null,
  selectedPlanId: null,
  editingPlan: null,
  isCreating: false,
  activeFilter: 'all',
  validationErrors: [],
  monthlyPreview: null
};

const PLAN_TYPE_LABELS = {
  daycare: '日托',
  short_term: '短期留宿',
  long_term: '月度长租'
};

async function api(path, options = {}) {
  try {
    const res = await fetch(API_BASE + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    return await res.json();
  } catch (e) {
    setStatus(false);
    return { success: false, errors: ['网络连接失败'] };
  }
}

function setStatus(ok, msg) {
  const dot = document.getElementById('statusBar').querySelector('.dot');
  const text = document.getElementById('statusText');
  dot.className = 'dot' + (ok === null ? '' : ok ? ' ok' : ' err');
  text.textContent = msg || (ok ? 'API 连接正常' : ok === false ? 'API 连接失败' : '连接中...');
}

async function loadPlans() {
  const res = await api('/plans');
  if (res.success) {
    state.plans = res.data;
    state.meta = res.meta;
    document.getElementById('minPrice').textContent = res.meta.thresholds.MIN_DAILY_PRICE;
    document.getElementById('maxPrice').textContent = res.meta.thresholds.MAX_DAILY_PRICE;
    setStatus(true);
    renderFilters();
    renderPlans();
  } else {
    setStatus(false);
  }
}

function renderFilters() {
  const container = document.getElementById('planFilters');
  const types = [
    { key: 'all', label: '全部' },
    { key: 'daycare', label: '日托' },
    { key: 'short_term', label: '短期留宿' },
    { key: 'long_term', label: '月度长租' }
  ];
  container.innerHTML = types.map(t =>
    `<span class="filter-chip ${state.activeFilter === t.key ? 'active' : ''}" data-key="${t.key}">${t.label}</span>`
  ).join('');
  container.querySelectorAll('.filter-chip').forEach(el => {
    el.addEventListener('click', () => {
      state.activeFilter = el.dataset.key;
      renderFilters();
      renderPlans();
    });
  });
}

function getDiscountDisplay(tieredDiscounts) {
  if (!tieredDiscounts || tieredDiscounts.length === 0) return '无';
  return tieredDiscounts
    .sort((a, b) => a.minDays - b.minDays)
    .map(t => `≥${t.minDays}天 ${(t.discount * 100).toFixed(0)}%`)
    .join(' / ');
}

function renderPlans() {
  const container = document.getElementById('plansList');
  let plans = state.plans;
  if (state.activeFilter !== 'all') {
    plans = plans.filter(p => p.type === state.activeFilter);
  }
  if (plans.length === 0) {
    container.innerHTML = '<div class="empty-hint">暂无匹配的方案</div>';
    return;
  }
  container.innerHTML = plans.map(plan => {
    const selected = plan.id === state.selectedPlanId;
    const hasConflict = plan.type === 'long_term' &&
      state.plans.some(p =>
        p.id !== plan.id &&
        p.type === 'long_term' &&
        !(plan.weightRange.max < p.weightRange.min || p.weightRange.max < plan.weightRange.min)
      );
    return `
      <div class="plan-card ${selected ? 'selected' : ''} ${hasConflict ? 'conflict' : ''}" data-id="${plan.id}">
        <div class="plan-card-header">
          <div class="plan-card-name">
            <span>${plan.name}</span>
            <span class="type-tag ${plan.type}">${PLAN_TYPE_LABELS[plan.type]}</span>
          </div>
        </div>
        <div class="plan-card-meta">
          <div class="row"><span>体重适配</span><b>${plan.weightRange.min} ~ ${plan.weightRange.max} kg</b></div>
          <div class="row"><span>单日单价</span><b>¥ ${plan.dailyPrice.toFixed(2)}</b></div>
          <div class="row"><span>阶梯折扣</span><b>${getDiscountDisplay(plan.tieredDiscounts)}</b></div>
        </div>
        ${hasConflict ? '<div class="plan-card-conflict">⚠ 与其他长租方案体重区间重叠（互斥冲突）</div>' : ''}
        <div class="plan-card-actions">
          <button class="btn ghost small" data-action="edit" data-id="${plan.id}">编辑</button>
          <button class="btn danger small" data-action="delete" data-id="${plan.id}">删除</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.plan-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.plan-card-actions')) return;
      state.selectedPlanId = card.dataset.id;
      state.isCreating = false;
      state.editingPlan = JSON.parse(JSON.stringify(state.plans.find(p => p.id === card.dataset.id)));
      state.validationErrors = [];
      renderPlans();
      renderEditor();
      updateMonthlyPreview();
    });
  });
  container.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      state.selectedPlanId = id;
      state.isCreating = false;
      state.editingPlan = JSON.parse(JSON.stringify(state.plans.find(p => p.id === id)));
      state.validationErrors = [];
      renderPlans();
      renderEditor();
      updateMonthlyPreview();
    });
  });
  container.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('确定删除该方案？')) return;
      const res = await api('/plans/' + btn.dataset.id, { method: 'DELETE' });
      if (res.success) {
        if (state.selectedPlanId === btn.dataset.id) {
          state.selectedPlanId = null;
          state.editingPlan = null;
          renderEditor();
        }
        loadPlans();
      } else {
        alert(res.errors.join('\n'));
      }
    });
  });
}

function emptyEditorTemplate() {
  return `
    <div class="empty-hint" style="padding-top:60px;">
      <div style="font-size:48px;margin-bottom:12px;">📝</div>
      <p>请选择左侧方案进行编辑</p>
      <p style="margin-top:6px;">或点击顶部「+ 新建方案」</p>
    </div>
  `;
}

function renderEditor() {
  const body = document.getElementById('editorBody');
  const cancelBtn = document.getElementById('cancelEditBtn');
  const title = document.getElementById('editorTitle');

  if (!state.editingPlan) {
    body.innerHTML = emptyEditorTemplate();
    cancelBtn.style.display = 'none';
    title.textContent = '方案编辑器';
    return;
  }
  cancelBtn.style.display = 'inline-flex';
  title.textContent = state.isCreating ? '新建收费方案' : '编辑方案 · ' + (state.editingPlan.name || '未命名');

  const p = state.editingPlan;
  const thresholds = state.meta ? state.meta.thresholds : { MIN_DAILY_PRICE: 10, MAX_DAILY_PRICE: 500 };
  const priceLocked = p.dailyPrice !== undefined && (p.dailyPrice < thresholds.MIN_DAILY_PRICE || p.dailyPrice > thresholds.MAX_DAILY_PRICE);
  const hasErrors = state.validationErrors.length > 0;

  body.innerHTML = `
    ${hasErrors ? `
      <div class="validation-errors">
        <div class="validation-errors-title">⚠ 参数校验失败，无法保存</div>
        <ul>${state.validationErrors.map(e => `<li>${e}</li>`).join('')}</ul>
      </div>
    ` : ''}

    <div class="monthly-preview" id="monthlyPreview">
      <div class="monthly-preview-title">📊 月度折算预览（${state.meta ? state.meta.daysInMonth : 30} 天标准月）</div>
      ${state.monthlyPreview ? `
        <div class="monthly-preview-row">
          <span class="label">单日单价</span>
          <span class="value">¥ ${state.monthlyPreview.dailyPrice.toFixed(2)}</span>
        </div>
        <div class="monthly-preview-row">
          <span class="label">适用折扣</span>
          <span class="value">${(state.monthlyPreview.applicableDiscount * 100).toFixed(0)}%</span>
        </div>
        <div class="monthly-preview-row" style="margin-top:8px;padding-top:8px;border-top:1px dashed #f59e0b;">
          <span class="label">月度折算总价</span>
          <span class="big">¥ ${state.monthlyPreview.monthlyTotal.toFixed(2)}</span>
        </div>
        ${state.monthlyPreview.thresholdErrors.length > 0 ? `
          <div style="margin-top:8px;font-size:11px;color:#b91c1c;">⚠ ${state.monthlyPreview.thresholdErrors.join('，')}</div>
        ` : ''}
      ` : '<div style="font-size:12px;color:#92400e;">调整参数后实时刷新...</div>'}
    </div>

    <div class="form-section">
      <div class="form-section-title">基础信息</div>
      <div class="field">
        <label>方案名称</label>
        <input type="text" id="f_name" value="${p.name || ''}" placeholder="例如：月度长租·小型犬" />
      </div>
      <div class="field">
        <label>方案类型</label>
        <select id="f_type">
          <option value="daycare" ${p.type === 'daycare' ? 'selected' : ''}>日托</option>
          <option value="short_term" ${p.type === 'short_term' ? 'selected' : ''}>短期留宿</option>
          <option value="long_term" ${p.type === 'long_term' ? 'selected' : ''}>月度长租</option>
        </select>
        <div class="hint">长租方案之间体重区间互斥，不能重叠</div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">价格与区间</div>
      <div class="field">
        <label>体重适配区间 (kg)</label>
        <div class="field-row">
          <input type="number" id="f_wmin" value="${p.weightRange ? p.weightRange.min : 0}" min="0" step="0.1" placeholder="最小" />
          <input type="number" id="f_wmax" value="${p.weightRange ? p.weightRange.max : 0}" min="0" step="0.1" placeholder="最大" />
        </div>
      </div>
      <div class="field">
        <label>单日单价 (元) <span style="color:#92400e;">[${thresholds.MIN_DAILY_PRICE} ~ ${thresholds.MAX_DAILY_PRICE}]</span></label>
        <input type="number" id="f_price" value="${p.dailyPrice !== undefined ? p.dailyPrice : ''}" min="0" step="1"
          class="${priceLocked ? 'locked' : ''}" ${priceLocked ? '' : ''} />
        ${priceLocked ? `<div class="error-hint">⚠ 参数超出阈值区间，已锁定，请修正后保存</div>` : ''}
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">连续寄养阶梯折扣</div>
      <div class="tier-list" id="tierList"></div>
      <button class="btn ghost small" id="addTierBtn">+ 添加折扣阶梯</button>
      <div class="hint" style="margin-top:6px;">折扣系数 0~1，例如 0.85 表示 85 折</div>
    </div>

    <div class="form-section">
      <div class="form-section-title">体重附加服务费</div>
      <div class="field-row">
        <div class="field">
          <label>附加费率 (0~1)</label>
          <input type="number" id="f_srate" value="${p.weightSurchargeRate || 0}" min="0" max="1" step="0.05" />
        </div>
        <div class="field">
          <label>生效阈值 (kg)</label>
          <input type="number" id="f_sthreshold" value="${p.weightSurchargeThreshold || 0}" min="0" step="0.5" />
        </div>
      </div>
      <div class="hint">体重大于阈值时，基础费按比例加收附加费</div>
    </div>

    <div class="editor-footer">
      <button class="btn ghost" id="resetBtn">重置</button>
      <button class="btn primary" id="saveBtn" ${hasErrors || priceLocked ? 'disabled' : ''}>💾 保存方案</button>
    </div>
  `;

  renderTierList();
  bindEditorEvents();
}

function renderTierList() {
  const list = document.getElementById('tierList');
  if (!list) return;
  const tiers = state.editingPlan.tieredDiscounts || [];
  if (tiers.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:#9ca3af;padding:6px 0;">暂未设置折扣阶梯</div>';
    return;
  }
  list.innerHTML = tiers.map((t, i) => `
    <div class="tier-item">
      <input type="number" placeholder="满N天" value="${t.minDays}" min="1" step="1" data-tier-idx="${i}" data-tier-field="minDays" />
      <input type="number" placeholder="折扣系数(0~1)" value="${t.discount}" min="0" max="1" step="0.05" data-tier-idx="${i}" data-tier-field="discount" />
      <button class="remove-btn" data-tier-remove="${i}" title="删除">×</button>
    </div>
  `).join('');
  list.querySelectorAll('[data-tier-idx]').forEach(inp => {
    inp.addEventListener('input', async (e) => {
      const idx = parseInt(e.target.dataset.tierIdx);
      const field = e.target.dataset.tierField;
      const val = parseFloat(e.target.value);
      if (!isNaN(val)) {
        state.editingPlan.tieredDiscounts[idx][field] = val;
        await validateAndPreview();
      }
    });
  });
  list.querySelectorAll('[data-tier-remove]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.tierRemove);
      state.editingPlan.tieredDiscounts.splice(idx, 1);
      renderTierList();
      await validateAndPreview();
    });
  });
}

function bindEditorEvents() {
  const fields = {
    f_name: 'name',
    f_type: 'type'
  };
  Object.entries(fields).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', async () => {
        state.editingPlan[key] = el.type === 'number' ? parseFloat(el.value) : el.value;
        await validateAndPreview();
      });
      el.addEventListener('change', async () => {
        state.editingPlan[key] = el.type === 'number' ? parseFloat(el.value) : el.value;
        await validateAndPreview();
      });
    }
  });

  const wmin = document.getElementById('f_wmin');
  const wmax = document.getElementById('f_wmax');
  if (wmin && wmax) {
    const handler = async () => {
      state.editingPlan.weightRange = {
        min: parseFloat(wmin.value) || 0,
        max: parseFloat(wmax.value) || 0
      };
      await validateAndPreview();
    };
    wmin.addEventListener('input', handler);
    wmax.addEventListener('input', handler);
  }

  const price = document.getElementById('f_price');
  if (price) {
    price.addEventListener('input', async () => {
      state.editingPlan.dailyPrice = parseFloat(price.value);
      await validateAndPreview();
    });
  }

  const srate = document.getElementById('f_srate');
  const sthreshold = document.getElementById('f_sthreshold');
  if (srate) srate.addEventListener('input', () => {
    state.editingPlan.weightSurchargeRate = parseFloat(srate.value) || 0;
  });
  if (sthreshold) sthreshold.addEventListener('input', () => {
    state.editingPlan.weightSurchargeThreshold = parseFloat(sthreshold.value) || 0;
  });

  const addTierBtn = document.getElementById('addTierBtn');
  if (addTierBtn) {
    addTierBtn.addEventListener('click', async () => {
      if (!state.editingPlan.tieredDiscounts) state.editingPlan.tieredDiscounts = [];
      state.editingPlan.tieredDiscounts.push({ minDays: 7, discount: 0.9 });
      renderTierList();
      await validateAndPreview();
    });
  }

  document.getElementById('cancelEditBtn').addEventListener('click', () => {
    state.editingPlan = null;
    state.selectedPlanId = null;
    state.isCreating = false;
    state.validationErrors = [];
    renderPlans();
    renderEditor();
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    if (state.isCreating) {
      state.editingPlan = createEmptyPlan();
    } else {
      state.editingPlan = JSON.parse(JSON.stringify(state.plans.find(p => p.id === state.selectedPlanId)));
    }
    state.validationErrors = [];
    renderEditor();
    updateMonthlyPreview();
  });

  document.getElementById('saveBtn').addEventListener('click', savePlan);
}

async function validateAndPreview() {
  const excludeId = state.isCreating ? null : state.selectedPlanId;
  const res = await api('/validate', {
    method: 'POST',
    body: { plan: state.editingPlan, excludeId }
  });
  state.validationErrors = res.errors || [];
  await updateMonthlyPreview();
  renderEditor();
}

async function updateMonthlyPreview() {
  if (!state.editingPlan) { state.monthlyPreview = null; return; }
  const res = await api('/preview/monthly', {
    method: 'POST',
    body: { plan: state.editingPlan }
  });
  if (res.success) {
    state.monthlyPreview = res.data;
  }
}

function createEmptyPlan() {
  return {
    name: '',
    type: 'daycare',
    weightRange: { min: 0, max: 10 },
    dailyPrice: 50,
    tieredDiscounts: [{ minDays: 7, discount: 0.9 }],
    weightSurchargeRate: 0,
    weightSurchargeThreshold: 0
  };
}

async function savePlan() {
  const excludeId = state.isCreating ? null : state.selectedPlanId;
  const valRes = await api('/validate', {
    method: 'POST',
    body: { plan: state.editingPlan, excludeId }
  });
  if (!valRes.isValid) {
    state.validationErrors = valRes.errors;
    renderEditor();
    return;
  }
  let res;
  if (state.isCreating) {
    res = await api('/plans', { method: 'POST', body: state.editingPlan });
  } else {
    res = await api('/plans/' + state.selectedPlanId, { method: 'PUT', body: state.editingPlan });
  }
  if (res.success) {
    state.isCreating = false;
    state.selectedPlanId = res.plan.id;
    await loadPlans();
    state.editingPlan = JSON.parse(JSON.stringify(res.plan));
    state.validationErrors = [];
    renderEditor();
  } else {
    alert('保存失败：\n' + (res.errors || []).join('\n'));
  }
}

async function calculate() {
  const w = parseFloat(document.getElementById('simWeight').value);
  const d = parseInt(document.getElementById('simDays').value);
  if (isNaN(w) || isNaN(d) || w < 0 || d < 1) {
    alert('请输入合法的体重和天数');
    return;
  }
  const res = await api('/calculate', { method: 'POST', body: { weight: w, days: d } });
  renderSimResult(res);
}

function renderSimResult(res) {
  const container = document.getElementById('simResult');
  if (!res.success) {
    container.innerHTML = `<div class="no-match"><div class="no-match-title">演算失败</div><div class="no-match-desc">${(res.errors || []).join('，')}</div></div>`;
    return;
  }
  const data = res.data;
  if (!data.best) {
    container.innerHTML = `<div class="no-match">
      <div class="no-match-title">未找到匹配方案</div>
      <div class="no-match-desc">体重 ${data.weight}kg、寄养 ${data.days} 天 暂无可匹配的收费方案</div>
    </div>`;
    return;
  }
  const best = data.best;
  const alternatives = data.allResults.filter(r => r.plan.id !== best.plan.id);

  container.innerHTML = `
    <div class="result-best">
      <div class="result-best-header">
        <div>
          <div class="result-best-title">🏆 最优计费方案</div>
          <div class="result-best-plan">
            ${best.plan.name}
            <span class="type-tag ${best.plan.type}">${PLAN_TYPE_LABELS[best.plan.type]}</span>
          </div>
        </div>
        <div class="result-best-total">¥ ${best.finalTotal.toFixed(2)}</div>
      </div>
      <div class="breakdown-list">
        ${best.breakdown.map(b => `
          <div class="breakdown-item ${b.amount < 0 ? 'negative' : ''}">
            <span class="desc">${b.description}</span>
            <span class="amount">${b.amount >= 0 ? '+' : ''}¥ ${b.amount.toFixed(2)}</span>
          </div>
        `).join('')}
        <div class="breakdown-item subtotal">
          <span class="desc">应付合计</span>
          <span class="amount">¥ ${best.finalTotal.toFixed(2)}</span>
        </div>
      </div>
    </div>

    ${alternatives.length > 0 ? `
      <div class="result-alternatives-title">其他可匹配方案（${alternatives.length}）</div>
      ${alternatives.map(a => `
        <div class="alternative-card">
          <div class="alternative-card-header">
            <div class="alternative-card-name">
              ${a.plan.name}
              <span class="type-tag ${a.plan.type}">${PLAN_TYPE_LABELS[a.plan.type]}</span>
            </div>
            <div class="alternative-card-total">¥ ${a.finalTotal.toFixed(2)}</div>
          </div>
          <div class="alternative-card-sub">
            单日 ${a.plan.dailyPrice}元 · 折扣 ${((a.breakdown.find(b => b.discount) || {}).discount || 1) * 100}%
            · 较最优贵 ¥ ${(a.finalTotal - best.finalTotal).toFixed(2)}
          </div>
        </div>
      `).join('')}
    ` : ''}
  `;
}

function init() {
  setStatus(null, '正在连接 API...');
  loadPlans();

  document.getElementById('addPlanBtn').addEventListener('click', () => {
    state.isCreating = true;
    state.selectedPlanId = null;
    state.editingPlan = createEmptyPlan();
    state.validationErrors = [];
    renderPlans();
    renderEditor();
    updateMonthlyPreview();
  });

  document.getElementById('calcBtn').addEventListener('click', calculate);
  document.getElementById('simWeight').addEventListener('keypress', (e) => { if (e.key === 'Enter') calculate(); });
  document.getElementById('simDays').addEventListener('keypress', (e) => { if (e.key === 'Enter') calculate(); });
}

document.addEventListener('DOMContentLoaded', init);
