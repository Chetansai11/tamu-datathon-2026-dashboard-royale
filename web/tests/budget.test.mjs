import test from 'node:test';
import assert from 'node:assert/strict';
import {actionCost, validatePortfolio} from '../src/budget.mjs';
const lease = {action_type_id:'A-REPLACE-LEASE',name:'Lease',unit:'machine',unit_cost_cents:250000,recurring_cost_cents_per_day:5500,lead_days:14,quantity_limit:20,incompatibility_group:'same_machine'};
const item = (action, targets=['M1'], quantity=targets.length) => ({action,targets,quantity,extraComp:0});
test('lease charges 16 operating days and full upfront fee',()=>assert.equal(actionCost(lease,2),6760));
test('purchases charge full capital even with nine benefit days',()=>assert.equal(actionCost({...lease,unit_cost_cents:2200000,recurring_cost_cents_per_day:0,lead_days:21}),22000));
test('package cost is not prorated by lead time',()=>assert.equal(actionCost({...lease,unit_cost_cents:1152000,recurring_cost_cents_per_day:0,lead_days:7}),11520));
test('extra comps consume budget',()=>assert.equal(actionCost({...lease,unit_cost_cents:400000,recurring_cost_cents_per_day:0},1,2500),6500));
test('nonfinite comp input is rejected',()=>assert.equal(validatePortfolio([{...item(lease),extraComp:NaN}]).valid,false));
test('target conflicts and missing targets are invalid',()=>{
  assert.equal(validatePortfolio([item(lease),item({...lease,action_type_id:'A-MOVE-MACHINE'})]).valid,false);
  assert.equal(validatePortfolio([item(lease,[],2)]).valid,false);
});
test('bank moves conflict with a replacement of a member',()=>assert.equal(validatePortfolio([{...item({...lease,unit:'bank'},['B1']),affectedMachines:['M1','M2']},item(lease,['M2'])]).valid,false));
test('budget, type limit, and exclusive comp policies enforced',()=>{
  assert.equal(validatePortfolio([item({...lease,unit_cost_cents:11000000})]).valid,false);
  assert.equal(validatePortfolio(Array.from({length:4},(_,i)=>item({...lease,action_type_id:`A${i}`,incompatibility_group:''},[`M${i}`]))).valid,false);
  assert.equal(validatePortfolio([item({...lease,unit:'pilot',incompatibility_group:'comp_policy'}),item({...lease,unit:'policy',incompatibility_group:'comp_policy'})]).valid,false);
});
