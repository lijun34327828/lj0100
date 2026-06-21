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
  MAX_DAILY_PRICE: 500,
  MIN_HOLIDAY_RATE: 1,
  MAX_HOLIDAY_RATE: 3
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
  if (plan.holidayPremiumRate !== undefined) {
    if (plan.holidayPremiumRate < THRESHOLDS.MIN_HOLIDAY_RATE || plan.holidayPremiumRate > THRESHOLDS.MAX_HOLIDAY_RATE) {
      errors.push(`节假日加价系数必须在 ${THRESHOLDS.MIN_HOLIDAY_RATE} 到 ${THRESHOLDS.MAX_HOLIDAY_RATE} 之间`);
    }
  }
  if (plan.multiPetDiscountTiers) {
    for (const tier of plan.multiPetDiscountTiers) {
      if (tier.minPets === undefined || tier.discount === undefined) {
        errors.push('多宠折扣配置不完整');
        break;
      }
      if (tier.minPets < 2) {
        errors.push('多宠折扣阶梯的同住数量起点不能小于 2');
        break;
      }
      if (tier.discount < 0 || tier.discount > 1) {
        errors.push('多宠折扣系数必须在 0 到 1 之间');
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

function getApplicableMultiPetDiscount(cohabitingPets, multiPetDiscountTiers) {
  if (!cohabitingPets || cohabitingPets < 2) {
    return 1;
  }
  if (!multiPetDiscountTiers || multiPetDiscountTiers.length === 0) {
    return 1;
  }
  const sorted = [...multiPetDiscountTiers].sort((a, b) => b.minPets - a.minPets);
  for (const tier of sorted) {
    if (cohabitingPets >= tier.minPets) {
      return tier.discount;
    }
  }
  return 1;
}

function matchPlansByWeight(weight, plans) {
  return plans.filter(p => isWeightInRange(weight, p.weightRange));
}

function selectBestPlan(weight, days, plans, holidayDays = 0, cohabitingPets = 1) {
  const candidates = matchPlansByWeight(weight, plans);
  if (candidates.length === 0) {
    return null;
  }
  const sorted = [...candidates].sort((a, b) => {
    if (a.type === PLAN_TYPES.LONG_TERM && b.type !== PLAN_TYPES.LONG_TERM) return -1;
    if (b.type === PLAN_TYPES.LONG_TERM && a.type !== PLAN_TYPES.LONG_TERM) return 1;
    const costA = calculatePlanCost(a, weight, days, holidayDays, cohabitingPets).finalTotal;
    const costB = calculatePlanCost(b, weight, days, holidayDays, cohabitingPets).finalTotal;
    return costA - costB;
  });
  return sorted[0];
}

function calculatePlanCost(plan, weight, days, holidayDays = 0, cohabitingPets = 1) {
  const pets = Math.max(1, parseInt(cohabitingPets) || 1);
  const breakdown = [];
  const dailyPrice = plan.dailyPrice;
  const premiumRate = plan.holidayPremiumRate || 1;
  const surchargeRate = plan.weightSurchargeRate || 0;
  const surchargeThreshold = plan.weightSurchargeThreshold || 0;
  const tieredDiscount = getApplicableDiscount(days, plan.tieredDiscounts);
  const multiDiscount = getApplicableMultiPetDiscount(pets, plan.multiPetDiscountTiers);

  const baseFeeSingle = dailyPrice * days;
  const baseFee = baseFeeSingle * pets;
  breakdown.push({
    type: '基础费',
    description: `${PLAN_TYPE_LABELS[plan.type]} · ${dailyPrice}元/天 × ${days}天 × ${pets}只`,
    amount: Number(baseFee.toFixed(2))
  });

  let holidayPremium = 0;
  if (holidayDays > 0 && premiumRate > 1) {
    const premiumDiff = premiumRate - 1;
    const holidayPremiumSingle = dailyPrice * holidayDays * premiumDiff;
    holidayPremium = holidayPremiumSingle * pets;
    breakdown.push({
      type: '节假日溢价',
      description: `节假日${holidayDays}天 · ${dailyPrice}元/天 × 溢价${(premiumDiff * 100).toFixed(0)}% × ${pets}只（系数${premiumRate}）`,
      amount: Number(holidayPremium.toFixed(2))
    });
  }

  let weightSurcharge = 0;
  if (surchargeRate > 0 && weight > surchargeThreshold) {
    const surchargeSingle = baseFeeSingle * surchargeRate;
    weightSurcharge = surchargeSingle * pets;
    breakdown.push({
      type: '体重附加费',
      description: `体重${weight}kg>${surchargeThreshold}kg · 基础费×${(surchargeRate * 100).toFixed(0)}% × ${pets}只`,
      amount: Number(weightSurcharge.toFixed(2))
    });
  }

  const subtotalBeforeMulti = baseFee + holidayPremium + weightSurcharge;

  let multiPetDiscountAmount = 0;
  if (pets >= 2 && multiDiscount < 1) {
    const singlePetSubtotal = subtotalBeforeMulti / pets;
    const extraPets = pets - 1;
    multiPetDiscountAmount = singlePetSubtotal * extraPets * (1 - multiDiscount);
    breakdown.push({
      type: '多宠折扣',
      description: `同住${pets}只，第2只起${extraPets}只享${(multiDiscount * 100).toFixed(0)}%折优惠`,
      amount: Number(-multiPetDiscountAmount.toFixed(2))
    });
  }

  const subtotalBeforeTiered = subtotalBeforeMulti - multiPetDiscountAmount;

  let tieredDiscountAmount = 0;
  if (tieredDiscount < 1) {
    tieredDiscountAmount = subtotalBeforeTiered * (1 - tieredDiscount);
    breakdown.push({
      type: '阶梯折扣',
      description: `连续寄养${days}天享${(tieredDiscount * 100).toFixed(0)}%折`,
      amount: Number(-tieredDiscountAmount.toFixed(2)),
      discount: tieredDiscount
    });
  }

  const finalTotal = subtotalBeforeTiered * tieredDiscount;

  const monthlyEquivalent = plan.type === PLAN_TYPES.LONG_TERM
    ? finalTotal
    : plan.dailyPrice * DAYS_IN_MONTH * getApplicableDiscount(DAYS_IN_MONTH, plan.tieredDiscounts || []);

  return {
    plan,
    breakdown,
    subtotal: Number(subtotalBeforeMulti.toFixed(2)),
    finalTotal: Number(finalTotal.toFixed(2)),
    monthlyEquivalent: Number(monthlyEquivalent.toFixed(2))
  };
}

function calculateBest(weight, days, plans, holidayDays = 0, cohabitingPets = 1) {
  if (holidayDays > days) {
    return {
      best: null,
      allResults: [],
      weight,
      days,
      holidayDays,
      cohabitingPets,
      errors: ['节假日天数不能大于寄养总天数']
    };
  }
  const matched = matchPlansByWeight(weight, plans);
  const allResults = matched.map(p => calculatePlanCost(p, weight, days, holidayDays, cohabitingPets));
  allResults.sort((a, b) => a.finalTotal - b.finalTotal);
  const best = allResults[0] || null;
  return { best, allResults, weight, days, holidayDays, cohabitingPets };
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
  getApplicableMultiPetDiscount,
  matchPlansByWeight,
  selectBestPlan,
  calculatePlanCost,
  calculateBest
};
