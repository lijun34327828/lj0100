const PLAN_TYPES = {
  DAYCARE: 'daycare',
  SHORT_TERM: 'short_term',
  LONG_TERM: 'long_term'
};

const PLAN_TYPE_LABELS = {
  [PLAN_TYPES.DAYCARE]: '日托',
  [PLAN_TYPES.SHORT_TERM]: '短期留宿',
  [PLAN_TYPES.LONG_TERM]: '月度长租'
};

const THRESHOLDS = {
  MIN_DAILY_PRICE: 10,
  MAX_DAILY_PRICE: 500
};

const DAYS_IN_MONTH = 30;

function validateThresholds(plan) {
  const errors = [];
  if (plan.dailyPrice !== undefined) {
    if (plan.dailyPrice < THRESHOLDS.MIN_DAILY_PRICE) {
      errors.push(`单日单价不能低于 ${THRESHOLDS.MIN_DAILY_PRICE} 元`);
    }
    if (plan.dailyPrice > THRESHOLDS.MAX_DAILY_PRICE) {
      errors.push(`单日单价不能高于 ${THRESHOLDS.MAX_DAILY_PRICE} 元`);
    }
  }
  return errors;
}

function isWeightInRange(weight, range) {
  return weight >= range.min && weight <= range.max;
}

function doRangesOverlap(rangeA, rangeB) {
  return !(rangeA.max < rangeB.min || rangeB.max < rangeA.min);
}

function validateMutualExclusion(plan, allPlans, excludeId = null) {
  const errors = [];
  if (plan.type !== PLAN_TYPES.LONG_TERM) {
    return errors;
  }
  const otherLongTermPlans = allPlans.filter(p =>
    p.type === PLAN_TYPES.LONG_TERM &&
    (excludeId === null || p.id !== excludeId) &&
    doRangesOverlap(p.weightRange, plan.weightRange)
  );
  if (otherLongTermPlans.length > 0) {
    const conflictNames = otherLongTermPlans.map(p => p.name).join('、');
    errors.push(`体重区间与长租方案 [${conflictNames}] 存在重叠，长租方案互斥`);
  }
  return errors;
}

function validatePlan(plan, allPlans, excludeId = null) {
  const errors = [];
  if (!plan.name || plan.name.trim() === '') {
    errors.push('方案名称不能为空');
  }
  if (!plan.type || !Object.values(PLAN_TYPES).includes(plan.type)) {
    errors.push('无效的方案类型');
  }
  if (!plan.weightRange || plan.weightRange.min === undefined || plan.weightRange.max === undefined) {
    errors.push('必须设置体重适配区间');
  } else if (plan.weightRange.min < 0 || plan.weightRange.max < plan.weightRange.min) {
    errors.push('体重区间设置不合法');
  }
  if (plan.dailyPrice === undefined || plan.dailyPrice < 0) {
    errors.push('单日单价必须设置且不能为负数');
  }
  errors.push(...validateThresholds(plan));
  if (plan.tieredDiscounts) {
    for (const tier of plan.tieredDiscounts) {
      if (tier.minDays === undefined || tier.discount === undefined) {
        errors.push('阶梯折扣配置不完整');
        break;
      }
      if (tier.discount < 0 || tier.discount > 1) {
        errors.push('折扣系数必须在 0 到 1 之间');
        break;
      }
    }
  }
  errors.push(...validateMutualExclusion(plan, allPlans, excludeId));
  return errors;
}

function getApplicableDiscount(days, tieredDiscounts) {
  if (!tieredDiscounts || tieredDiscounts.length === 0) {
    return 1;
  }
  const sorted = [...tieredDiscounts].sort((a, b) => b.minDays - a.minDays);
  for (const tier of sorted) {
    if (days >= tier.minDays) {
      return tier.discount;
    }
  }
  return 1;
}

function matchPlansByWeight(weight, plans) {
  return plans.filter(p => isWeightInRange(weight, p.weightRange));
}

function selectBestPlan(weight, days, plans) {
  const candidates = matchPlansByWeight(weight, plans);
  if (candidates.length === 0) {
    return null;
  }
  const sorted = [...candidates].sort((a, b) => {
    if (a.type === PLAN_TYPES.LONG_TERM && b.type !== PLAN_TYPES.LONG_TERM) return -1;
    if (b.type === PLAN_TYPES.LONG_TERM && a.type !== PLAN_TYPES.LONG_TERM) return 1;
    const costA = calculatePlanCost(a, weight, days).finalTotal;
    const costB = calculatePlanCost(b, weight, days).finalTotal;
    return costA - costB;
  });
  return sorted[0];
}

function calculatePlanCost(plan, weight, days) {
  const breakdown = [];
  const baseFee = plan.dailyPrice * days;
  breakdown.push({
    type: '基础费',
    description: `${PLAN_TYPE_LABELS[plan.type]} · ${plan.dailyPrice}元/天 × ${days}天`,
    amount: baseFee
  });
  const surchargeRate = plan.weightSurchargeRate || 0;
  if (surchargeRate > 0 && weight > (plan.weightSurchargeThreshold || 0)) {
    const surcharge = baseFee * surchargeRate;
    breakdown.push({
      type: '附加服务费',
      description: `体重附加费（超出${plan.weightSurchargeThreshold || 0}kg × ${(surchargeRate * 100).toFixed(0)}%）`,
      amount: surcharge
    });
  }
  const subtotal = breakdown.reduce((sum, b) => sum + b.amount, 0);
  const discount = getApplicableDiscount(days, plan.tieredDiscounts);
  if (discount < 1) {
    const discountAmount = subtotal * (1 - discount);
    breakdown.push({
      type: '折扣减免',
      description: `连续寄养${days}天享${(discount * 100).toFixed(0)}%折扣`,
      amount: -discountAmount,
      discount: discount
    });
  }
  const finalTotal = subtotal * discount;
  const monthlyEquivalent = plan.type === PLAN_TYPES.LONG_TERM
    ? finalTotal
    : plan.dailyPrice * DAYS_IN_MONTH * getApplicableDiscount(DAYS_IN_MONTH, plan.tieredDiscounts || []);
  return {
    plan,
    breakdown,
    subtotal,
    finalTotal: Number(finalTotal.toFixed(2)),
    monthlyEquivalent: Number(monthlyEquivalent.toFixed(2))
  };
}

function calculateBest(weight, days, plans) {
  const matched = matchPlansByWeight(weight, plans);
  const allResults = matched.map(p => calculatePlanCost(p, weight, days));
  allResults.sort((a, b) => a.finalTotal - b.finalTotal);
  const best = allResults[0] || null;
  return { best, allResults, weight, days };
}

module.exports = {
  PLAN_TYPES,
  PLAN_TYPE_LABELS,
  THRESHOLDS,
  DAYS_IN_MONTH,
  validateThresholds,
  validateMutualExclusion,
  validatePlan,
  getApplicableDiscount,
  matchPlansByWeight,
  selectBestPlan,
  calculatePlanCost,
  calculateBest
};
