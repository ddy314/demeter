import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateEconomics} from '../apps/web/src/demo/finance.ts';
const study={inputs:{yield_kg_tree:10},economics:{greenhouse_capex:4000,yield_kg:1000,operating_cost:1500,maintenance_rate:.04}};
test('capital, annual net and discounted cashflow use consistent units',()=>{const e=calculateEconomics(study,1000,3,10);assert.equal(e.capex,5000);assert.equal(e.opex,1700);assert.equal(e.net,1300);assert.deepEqual(e.cashflow,[-5000,-3700,-2400,-1100,200,1500]);assert.ok(Math.abs(e.npv-(-5000+1300*(1-(1.08)**-5)/.08))<1e-8);});
test('loss-making scenario has no fictional payback',()=>{const e=calculateEconomics(study,1000,1,10);assert.equal(e.net,-700);assert.equal(e.payback,null);assert.ok(e.npv< -5000);});
test('yield and sale price sensitivity affect revenue rather than capital',()=>{const e=calculateEconomics(study,1000,3,20);assert.equal(e.revenue,6000);assert.equal(e.capex,5000);assert.equal(e.lowNet,3100);assert.equal(e.highNet,5500);});
