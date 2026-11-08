/** Conditional placement economics. Predictions describe associations, not move effects. */
export function predictionValid(p) {
  return p?.supported === true && ['mean', 'lower', 'upper'].every(k => Number.isFinite(p[k]) && p[k] >= 0)
    && p.lower <= p.mean && p.mean <= p.upper;
}

export function placementScenario(report, machineId, destinationId, displacement = .5, reservedCost = 0, reservedTypes = 0) {
  const reject = reason => ({valid:false, reason});
  if (!report || !Number.isFinite(displacement) || displacement < 0 || displacement > 1 || !Number.isFinite(reservedCost) || reservedCost < 0 || !Number.isInteger(reservedTypes) || reservedTypes < 0 || reservedTypes > 3) return reject('Invalid scenario inputs.');
  const machine = report.machines.find(m => m.id === machineId);
  const destination = report.locations.find(l => l.id === destinationId);
  const source = report.locations.find(l => l.id === machine?.currentLocation);
  if (!machine || !source || source.occupant !== machineId || !destination) return reject('Select an active machine and a valid June 30 destination.');
  if (reservedCost > 100000) return reject('The retained plan exceeds the budget.');
  if (destination.id === source.id) return {valid:true,kind:'keep',moves:[],cost:0,totalCost:reservedCost,reserve:100000-reservedCost,actionTypes:reservedTypes,net:0,lower:0,upper:0,gross:0,disruption:0,benefitDays:30,displacement,destination,source,reason:'Keep the current placement. No relocation cost or assumed uplift.'};
  const moves = [{machine, from:source, to:destination}];
  if (destination.occupant) {
    const partner = report.machines.find(m => m.id === destination.occupant);
    if (!partner || partner.currentLocation !== destination.id || partner.id === machineId) return reject('Destination occupancy cannot be reconciled.');
    moves.push({machine:partner,from:destination,to:source});
  }
  const catalog = report.catalog;
  if (!catalog || !['unitCost','leadDays','downtimeHours','quantityLimit'].every(k => Number.isFinite(catalog[k]) && catalog[k] >= 0)) return reject('Move pricing is unavailable.');
  if (moves.length > catalog.quantityLimit || reservedTypes + 1 > 3) return reject('This scenario exceeds the catalog quantity or three-action limit.');
  const cost = moves.length * catalog.unitCost;
  if (cost + reservedCost > 100000) return reject('This scenario exceeds the $100,000 budget.');
  const benefitDays = Math.max(0,30-catalog.leadDays), hours=benefitDays*24;
  if (catalog.downtimeHours > hours) return reject('Move downtime exceeds the remaining horizon.');
  for (const move of moves) {
    move.current = move.machine.predictions[move.from.zone];
    move.proposed = move.machine.predictions[move.to.zone];
    if (!predictionValid(move.current) || !predictionValid(move.proposed)) {
      return reject(`${move.machine.id}: insufficient training support for ${!predictionValid(move.current) ? move.from.zone : move.to.zone}. Both sides of a swap need supported comparisons.`);
    }
  }
  const retained = change => change > 0 ? change * (1-displacement) : change;
  const economics = (toKey,fromKey) => {
    const gross = moves.reduce((v,m) => v+(m.proposed[toKey]-m.current[fromKey])*hours,0);
    const disruption = moves.reduce((v,m) => v+m.proposed[toKey]*catalog.downtimeHours,0);
    return {gross,disruption,net:retained(gross)-disruption-cost};
  };
  const center = economics('mean','mean');
  // The sensitivity envelope evaluates all endpoint combinations. With
  // displacement, increasing a rate can increase downtime cost even when its
  // positive demand change is fully displaced; do not assume monotonicity.
  const endpointNets=[];
  const endpointRates=moves.flatMap(m=>[[m.proposed.lower,m.proposed.upper],[m.current.lower,m.current.upper]]);
  for(let mask=0;mask<2**endpointRates.length;mask++) {
    let gross=0,disruption=0;
    moves.forEach((m,i)=>{const to=endpointRates[2*i][(mask>>(2*i))&1],from=endpointRates[2*i+1][(mask>>(2*i+1))&1];gross+=(to-from)*hours;disruption+=to*catalog.downtimeHours;});
    endpointNets.push(retained(gross)-disruption-cost);
  }
  // Include the kink at combined gross change = 0. Its feasible weighted
  // proposed-rate range determines the downtime extrema at that boundary.
  const fromLo=moves.reduce((v,m)=>v+m.current.lower,0),fromHi=moves.reduce((v,m)=>v+m.current.upper,0);
  const toLo=moves.reduce((v,m)=>v+m.proposed.lower,0),toHi=moves.reduce((v,m)=>v+m.proposed.upper,0);
  const intersectionLo=Math.max(fromLo,toLo),intersectionHi=Math.min(fromHi,toHi);
  if(intersectionLo<=intersectionHi) endpointNets.push(-intersectionLo*catalog.downtimeHours-cost,-intersectionHi*catalog.downtimeHours-cost);
  return {valid:true,kind:moves.length===2?'swap':'move',moves,cost,totalCost:cost+reservedCost,reserve:100000-cost-reservedCost,actionTypes:reservedTypes+1,...center,lower:Math.min(...endpointNets,center.net),upper:Math.max(...endpointNets,center.net),benefitDays,displacement,destination,source,reason:'Conditional association scenario; no causal relocation benefit has been established.'};
}

export function rankDestinations(report,machineId,displacement=.5,reservedCost=0,reservedTypes=0) {
  return report.locations.map(location=>({location,...placementScenario(report,machineId,location.id,displacement,reservedCost,reservedTypes)}))
    .sort((a,b)=>Number(b.valid)-Number(a.valid)||(b.net??-Infinity)-(a.net??-Infinity)||a.location.id.localeCompare(b.location.id));
}
