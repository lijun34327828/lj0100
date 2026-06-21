const billing = require('../billing/core');

let plans = [
  {
    id: 'p1',
    name: '日托·小型犬',
    type: billing.PLAN_TYPES.DAYCARE,
    weightRange: { min: 0, max: 10 },
    dailyPrice: 50,
    tieredDiscounts: [
      { minDays: 7, discount: 0.9 },
      { minDays: 14, discount: 0.85 }
    ],
    weightSurchargeRate: 0,
    weightSurchargeThreshold: 0,
    holidayPremiumRate: 1.5,
    multiPetDiscountTiers: [
      { minPets: 2, discount: 0.9 },
      { minPets: 3, discount: 0.85 }
    ]
  },
  {
    id: 'p2',
    name: '日托·中型犬',
    type: billing.PLAN_TYPES.DAYCARE,
    weightRange: { min: 10, max: 25 },
    dailyPrice: 80,
    tieredDiscounts: [
      { minDays: 7, discount: 0.9 }
    ],
    weightSurchargeRate: 0,
    weightSurchargeThreshold: 0,
    holidayPremiumRate: 1.5,
    multiPetDiscountTiers: [
      { minPets: 2, discount: 0.9 }
    ]
  },
  {
    id: 'p3',
    name: '短期留宿·小型犬',
    type: billing.PLAN_TYPES.SHORT_TERM,
    weightRange: { min: 0, max: 10 },
    dailyPrice: 100,
    tieredDiscounts: [
      { minDays: 3, discount: 0.95 },
      { minDays: 7, discount: 0.9 },
      { minDays: 14, discount: 0.8 }
    ],
    weightSurchargeRate: 0,
    weightSurchargeThreshold: 0,
    holidayPremiumRate: 2,
    multiPetDiscountTiers: [
      { minPets: 2, discount: 0.88 },
      { minPets: 3, discount: 0.8 },
      { minPets: 5, discount: 0.75 }
    ]
  },
  {
    id: 'p4',
    name: '短期留宿·中型犬',
    type: billing.PLAN_TYPES.SHORT_TERM,
    weightRange: { min: 10, max: 25 },
    dailyPrice: 150,
    tieredDiscounts: [
      { minDays: 3, discount: 0.95 },
      { minDays: 7, discount: 0.88 }
    ],
    weightSurchargeRate: 0.15,
    weightSurchargeThreshold: 15,
    holidayPremiumRate: 2,
    multiPetDiscountTiers: [
      { minPets: 2, discount: 0.88 },
      { minPets: 4, discount: 0.8 }
    ]
  },
  {
    id: 'p5',
    name: '月度长租·小型犬',
    type: billing.PLAN_TYPES.LONG_TERM,
    weightRange: { min: 0, max: 10 },
    dailyPrice: 70,
    tieredDiscounts: [
      { minDays: 30, discount: 0.75 }
    ],
    weightSurchargeRate: 0,
    weightSurchargeThreshold: 0,
    holidayPremiumRate: 1.3,
    multiPetDiscountTiers: [
      { minPets: 2, discount: 0.85 },
      { minPets: 3, discount: 0.78 }
    ]
  },
  {
    id: 'p6',
    name: '月度长租·中大型犬',
    type: billing.PLAN_TYPES.LONG_TERM,
    weightRange: { min: 10, max: 40 },
    dailyPrice: 110,
    tieredDiscounts: [
      { minDays: 30, discount: 0.72 }
    ],
    weightSurchargeRate: 0.1,
    weightSurchargeThreshold: 25,
    holidayPremiumRate: 1.3,
    multiPetDiscountTiers: [
      { minPets: 2, discount: 0.85 }
    ]
  }
];

let nextId = 100;

function getAllPlans() {
  return plans;
}

function getPlanById(id) {
  return plans.find(p => p.id === id) || null;
}

function addPlan(planData) {
  const errors = billing.validatePlan(planData, plans);
  if (errors.length > 0) {
    return { success: false, errors };
  }
  const newPlan = {
    ...planData,
    id: 'p' + (nextId++)
  };
  plans.push(newPlan);
  return { success: true, plan: newPlan };
}

function updatePlan(id, planData) {
  const idx = plans.findIndex(p => p.id === id);
  if (idx === -1) {
    return { success: false, errors: ['方案不存在'] };
  }
  const merged = { ...plans[idx], ...planData, id };
  const errors = billing.validatePlan(merged, plans, id);
  if (errors.length > 0) {
    return { success: false, errors };
  }
  plans[idx] = merged;
  return { success: true, plan: plans[idx] };
}

function deletePlan(id) {
  const idx = plans.findIndex(p => p.id === id);
  if (idx === -1) {
    return { success: false, errors: ['方案不存在'] };
  }
  const removed = plans.splice(idx, 1)[0];
  return { success: true, plan: removed };
}

module.exports = {
  getAllPlans,
  getPlanById,
  addPlan,
  updatePlan,
  deletePlan
};
