const express = require('express');
const cors = require('cors');
const path = require('path');
const store = require('./data/store');
const billing = require('./billing/core');

const API_PORT = 8880;
const UI_PORT = 3874;

const apiApp = express();
apiApp.use(cors());
apiApp.use(express.json());

apiApp.get('/api/plans', (req, res) => {
  res.json({
    success: true,
    data: store.getAllPlans(),
    meta: {
      planTypes: billing.PLAN_TYPES,
      planTypeLabels: billing.PLAN_TYPE_LABELS,
      thresholds: billing.THRESHOLDS,
      daysInMonth: billing.DAYS_IN_MONTH
    }
  });
});

apiApp.get('/api/plans/:id', (req, res) => {
  const plan = store.getPlanById(req.params.id);
  if (!plan) {
    return res.status(404).json({ success: false, errors: ['方案不存在'] });
  }
  res.json({ success: true, data: plan });
});

apiApp.post('/api/plans', (req, res) => {
  const result = store.addPlan(req.body);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

apiApp.put('/api/plans/:id', (req, res) => {
  const result = store.updatePlan(req.params.id, req.body);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

apiApp.delete('/api/plans/:id', (req, res) => {
  const result = store.deletePlan(req.params.id);
  if (!result.success) {
    return res.status(404).json(result);
  }
  res.json(result);
});

apiApp.post('/api/validate', (req, res) => {
  const { plan, excludeId } = req.body;
  const allPlans = store.getAllPlans();
  const errors = billing.validatePlan(plan, allPlans, excludeId);
  res.json({
    success: errors.length === 0,
    errors,
    isValid: errors.length === 0
  });
});

apiApp.post('/api/validate/mutex', (req, res) => {
  const { plan, excludeId } = req.body;
  const allPlans = store.getAllPlans();
  const errors = billing.validateMutualExclusion(plan, allPlans, excludeId);
  res.json({
    success: errors.length === 0,
    errors,
    hasConflict: errors.length > 0
  });
});

apiApp.post('/api/validate/thresholds', (req, res) => {
  const errors = billing.validateThresholds(req.body.plan || req.body);
  res.json({
    success: errors.length === 0,
    errors,
    thresholds: billing.THRESHOLDS
  });
});

apiApp.post('/api/calculate', (req, res) => {
  const { weight, days } = req.body;
  if (weight === undefined || days === undefined) {
    return res.status(400).json({
      success: false,
      errors: ['缺少参数：weight（体重kg）和 days（寄养天数）']
    });
  }
  if (weight < 0 || days < 1) {
    return res.status(400).json({
      success: false,
      errors: ['参数不合法：体重不能为负数，天数至少1天']
    });
  }
  const allPlans = store.getAllPlans();
  const result = billing.calculateBest(weight, days, allPlans);
  res.json({ success: true, data: result });
});

apiApp.post('/api/calculate/plan/:id', (req, res) => {
  const plan = store.getPlanById(req.params.id);
  if (!plan) {
    return res.status(404).json({ success: false, errors: ['方案不存在'] });
  }
  const { weight, days } = req.body;
  if (weight === undefined || days === undefined) {
    return res.status(400).json({ success: false, errors: ['缺少参数'] });
  }
  const result = billing.calculatePlanCost(plan, weight, days);
  res.json({ success: true, data: result });
});

apiApp.post('/api/preview/monthly', (req, res) => {
  const { plan } = req.body;
  if (!plan) {
    return res.status(400).json({ success: false, errors: ['缺少方案数据'] });
  }
  const errors = billing.validateThresholds(plan);
  const discount = billing.getApplicableDiscount(billing.DAYS_IN_MONTH, plan.tieredDiscounts || []);
  const monthlyTotal = (plan.dailyPrice || 0) * billing.DAYS_IN_MONTH * discount;
  res.json({
    success: true,
    data: {
      monthlyTotal: Number(monthlyTotal.toFixed(2)),
      dailyPrice: plan.dailyPrice || 0,
      daysInMonth: billing.DAYS_IN_MONTH,
      applicableDiscount: discount,
      thresholdErrors: errors
    }
  });
});

apiApp.listen(API_PORT, () => {
  console.log(`[API] 寄养计费演算服务已启动: http://localhost:${API_PORT}`);
});

const uiApp = express();
uiApp.use(cors());
uiApp.use(express.static(path.join(__dirname, '..', 'public')));

uiApp.listen(UI_PORT, () => {
  console.log(`[UI]  可视化调试界面已启动:   http://localhost:${UI_PORT}`);
});
