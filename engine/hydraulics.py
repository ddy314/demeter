"""EPANET 2.2, SI units, Darcy–Weisbach, pressure-dependent nozzle outflow.

All equipment is explicitly synthetic. Valves isolate each terminal nozzle;
shared transport pipes remain pressurized in every rotational spray group.
"""

import logging
import math
import tempfile
import warnings

import numpy as np
import wntr

RHO_G = 9806.65
PUMPS = [
    {"id": "P60", "head": 60.0, "q_nom": 0.002, "price": 1800},
    {"id": "P85", "head": 85.0, "q_nom": 0.0025, "price": 2400},
    {"id": "P110", "head": 110.0, "q_nom": 0.003, "price": 3200},
]
PIPE_PRICES = {25: 3.8, 32: 5.8, 40: 8.2, 50: 11.5}
CATALOG_VERSION = "synthetic-water-v1"
NOZZLE_LPM = 0.8
NOMINAL_HEAD = 300000 / RHO_G


def simulate(
    scene,
    nodes,
    source,
    edges,
    trunk_mm,
    lateral_mm,
    pump,
    zones,
    *,
    head_factor=1.0,
    roughness_factor=1.0,
    elevation_offset=0.0,
):
    zone_ids = sorted(
        {min(zones - 1, int(n["y"] / scene.depth * zones)) for n in nodes}
    )
    pressures = {}
    outflows = {}
    energy = 0.0
    duration = 0.0
    max_flow = 0.0
    max_velocity = 0.0
    all_max_pressure = 0.0
    residual = 0.0
    converged = True
    for zone in zone_ids:
        wn = wntr.network.WaterNetworkModel()
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", message="Changing the headloss formula")
            wn.options.hydraulic.headloss = "D-W"
        wn.options.hydraulic.accuracy = 0.00001
        wn.options.hydraulic.trials = 100
        wn.options.hydraulic.unbalanced = "STOP"
        wn.options.time.duration = 0
        wn.options.hydraulic.inpfile_units = "LPS"
        sz = source["z"]
        wn.add_reservoir("R", base_head=sz)
        wn.add_junction("S", base_demand=0, elevation=sz)
        active = []
        for n in nodes:
            z = n["z"] + elevation_offset * n["y"] / scene.depth
            wn.add_junction(n["id"], base_demand=0, elevation=z)
            if min(zones - 1, int(n["y"] / scene.depth * zones)) == zone:
                wn.get_node(n["id"]).emitter_coefficient = (
                    NOZZLE_LPM / 60000 / math.sqrt(NOMINAL_HEAD)
                )
                active.append(n["id"])
        h = pump["head"] * head_factor
        wn.add_curve(
            "curve",
            "HEAD",
            [(0, h), (pump["q_nom"], h * 0.8), (2 * pump["q_nom"], h * 0.2)],
        )
        wn.add_pump("pump", "R", "S", pump_type="HEAD", pump_parameter="curve")
        for e in edges:
            wn.add_pipe(
                e["id"],
                e["a"],
                e["b"],
                length=e["length"],
                diameter=(trunk_mm if e["trunk"] else lateral_mm) / 1000,
                roughness=1.5e-6 * roughness_factor,
                minor_loss=1.5,
            )
        try:
            with (
                tempfile.TemporaryDirectory(prefix="demeter-") as d,
                warnings.catch_warnings(),
            ):
                warnings.simplefilter("ignore")
                result = wntr.sim.EpanetSimulator(wn).run_sim(
                    file_prefix=d + "/network", version=2.2, convergence_error=True
                )
            p = result.node["pressure"].iloc[0]
            demand = result.node["demand"].iloc[0]
            flow = result.link["flowrate"].iloc[0]
            velocity = result.link["velocity"].iloc[0]
            if (
                not np.isfinite(p.to_numpy()).all()
                or not np.isfinite(flow.to_numpy()).all()
            ):
                raise ValueError("non-finite result")
            q = float(flow["pump"])
            if q < 0:
                raise ValueError("negative pump flow")
            max_flow = max(max_flow, q * 60000)
            max_velocity = max(max_velocity, float(velocity.drop("pump").abs().max()))
            all_max_pressure = max(
                all_max_pressure, float(p.drop("R").max()) * RHO_G / 1e6
            )
            residual = max(
                residual, abs(q - sum(float(demand[n["id"]]) for n in nodes))
            )
            min_q = min(float(demand[i]) for i in active)
            spray_seconds = scene.volume_l / 1000 / max(min_q, 1e-12)
            # Each nozzle runs until the slowest outlet supplies the requested volume.
            duration += spray_seconds + 45  # synthetic switching allowance
            pump_head = float(
                result.node["head"].iloc[0]["S"] - result.node["head"].iloc[0]["R"]
            )
            energy += RHO_G * q * max(pump_head, 0) / 0.65 * spray_seconds / 3.6e6
            for i in active:
                pressures[i] = round(float(p[i]) * RHO_G / 1e6, 5)
                outflows[i] = round(float(demand[i]) * 60000, 5)
        except Exception as exc:
            # A failed numerical solve can never enter the feasible set.
            logging.getLogger(__name__).debug(
                "EPANET configuration rejected", exc_info=True
            )
            converged = False
            return {
                "converged": False,
                "error": type(exc).__name__,
                "pressures": {},
                "min_pressure": 0.0,
                "max_pressure": 0.0,
                "duration_min": 0.0,
                "energy_kwh": 0.0,
                "flow_lpm": 0.0,
                "max_velocity": 0.0,
                "mass_residual_m3s": None,
                "violations": ["Solver did not converge"],
            }
    duration += 180  # illustrative flushing/setup time, not transient simulation
    minimum = min(pressures.values())
    maximum = max(pressures.values())
    # Shut-off head pressurizes all pipework even when all terminal valves are closed.
    static_max = max(
        (
            source["z"]
            + pump["head"] * head_factor
            - (n["z"] + elevation_offset * n["y"] / scene.depth)
        )
        * RHO_G
        / 1e6
        for n in nodes + [source]
    )
    violations = []
    if minimum < scene.min_pressure:
        violations.append("Insufficient pressure at upper or terminal nodes")
    if all_max_pressure > scene.max_pressure:
        violations.append("Operating pressure exceeds the limit")
    if static_max > 1.25:
        violations.append("Static pressure exceeds the pipe rating")
    if max_flow > scene.source_lpm:
        violations.append("Insufficient source flow")
    if max_velocity > 3:
        violations.append("Pipe velocity exceeds 3 m/s")
    if max_flow / 60000 > 2 * pump["q_nom"]:
        violations.append("Flow exceeds the pump curve range")
    if residual > 1e-6:
        violations.append("Mass balance residual exceeds tolerance")
    return {
        "converged": converged,
        "pressures": pressures,
        "outflows_lpm": outflows,
        "min_pressure": minimum,
        "max_pressure": maximum,
        "network_max_pressure": round(all_max_pressure, 5),
        "static_max_pressure": round(static_max, 5),
        "duration_min": round(duration / 60, 2),
        "energy_kwh": round(energy, 4),
        "flow_lpm": round(max_flow, 2),
        "max_velocity": round(max_velocity, 3),
        "mass_residual_m3s": residual,
        "violations": violations,
        "zone_count": len(zone_ids),
    }


def cost_plan(scene, nodes, edges, trunk_mm, lateral_mm, pump, zones):
    bom = []
    for diameter in sorted({trunk_mm, lateral_mm}):
        length = sum(
            e["length"]
            for e in edges
            if (trunk_mm if e["trunk"] else lateral_mm) == diameter
        )
        bom.append(
            {
                "item": f"Pipe · internal diameter {diameter} mm",
                "quantity": round(length, 2),
                "unit": "m",
                "unit_cost": PIPE_PRICES[diameter],
                "subtotal": round(length * PIPE_PRICES[diameter], 2),
            }
        )
    length = sum(e["length"] for e in edges)
    for item, q, unit, price in [
        (
            "Pipe installation (terrain factor)",
            length,
            "m",
            3 + scene.rise / scene.depth * 3,
        ),
        ("Fixed emitters", len(nodes), "each", 18),
        ("Terminal control valves", len(nodes), "each", 22),
        ("Pump station " + pump["id"], 1, "set", pump["price"]),
        ("Filter / reservoir / fittings", 1, "set", 1450),
        ("Zone controller", 1, "set", 180 + zones * 70),
    ]:
        bom.append(
            {
                "item": item,
                "quantity": round(q, 2),
                "unit": unit,
                "unit_cost": round(price, 3),
                "subtotal": round(q * price, 2),
            }
        )
    return round(sum(b["subtotal"] for b in bom), 2), bom
