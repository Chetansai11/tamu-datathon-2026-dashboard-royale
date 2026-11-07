"""Why did a machine earn less than an average machine? Exposure, game, location, machine, luck.

For machine i over the selected period, with actual house win W_i and theo T_i:

    B          = sum_d  abar_d * f_d                       an average machine on the floor every day
    exposure   = sum_d  h_id * f_d            - B          fewer days on the floor, or more downtime
    game       = sum_d  h_id * (g_cd - f_d)                its game's floor-wide earning rate
    location   = sum_d  h_id * g_cd * (L_zm - 1)           its zone, adjusted for that zone's game mix
    machine    = T_i - sum_d h_id * g_cd * L_zm            this machine versus the same game in the same zone
    luck       = W_i - T_i                                 payout luck or a payout problem (see luck_z)

and exposure + game + location + machine + luck = W_i - B exactly.

h_id: the machine's available hours on gaming day d. f_d: floor theo per available hour that day.
g_cd: theo per available hour of the machine's game configuration that day. L_zm: the zone's
theo divided by its game-mix expectation (sum h * g_cd) in that month. Every rate used for
machine i leaves machine i out, so a machine never benchmarks against itself. The zone is
the one the machine stood in on each date, so machines that moved are split correctly.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from src import metrics as m

COMPONENTS = ["exposure", "game", "location", "machine", "luck"]
OUT = Path(__file__).resolve().parents[1] / "outputs" / "q1_decomposition.json"


def _rows(start: str | None, end: str | None) -> pd.DataFrame:
    d = m.sql(f"""
        SELECT machine_id, gaming_date, month, zone_id, zone_name, bank_id, config_id, theme,
               available_hours::DOUBLE AS h, occupied_hours::DOUBLE AS occ,
               theo_usd::DOUBLE AS theo, house_win_usd::DOUBLE AS win, house_win_var_usd2 AS var
        FROM floor WHERE {m._where(start, end, None)[0]}
    """, m._where(start, end, None)[1])
    d["week"] = (pd.to_datetime(d.gaming_date) - pd.Timestamp("2024-12-30")).dt.days // 7
    return d


def _loo(d: pd.DataFrame, keys: list[str], num: str, den: str) -> pd.Series:
    """Group ratio sum(num)/sum(den) over `keys`, leaving out each row's own machine."""
    g = d.groupby(keys)[[num, den]].transform("sum")
    own = d.groupby(keys + ["machine_id"])[[num, den]].transform("sum")
    n, k = g[num] - own[num], g[den] - own[den]
    return (n / k.where(k > 0)).astype(float)


def decompose(start: str | None = None, end: str | None = None, draws: int = 1000, seed: int = 7) -> pd.DataFrame:
    d = _rows(start, end)

    # Benchmark: an average machine, on the floor every day at that day's average availability.
    day = d.groupby("gaming_date").agg(h=("h", "sum"), theo=("theo", "sum"), n=("machine_id", "nunique"))
    bench = float(((day.h / day.n) * (day.theo / day.h)).sum())

    d["f"] = _loo(d, ["gaming_date"], "theo", "h")
    d["g"] = _loo(d, ["gaming_date", "config_id"], "theo", "h").fillna(d["f"])

    # Zone factor by month: zone theo over its game-mix expectation, leaving the machine out.
    d["g_all"] = d.groupby(["gaming_date", "config_id"]).theo.transform("sum") / d.groupby(
        ["gaming_date", "config_id"]).h.transform("sum")
    d["mix"] = d.h * d.g_all
    d["L"] = _loo(d, ["zone_id", "month"], "theo", "mix").fillna(1.0)

    d["e_floor"], d["e_game"] = d.h * d.f, d.h * d.g
    d["e_loc"] = d.e_game * d.L

    per = d.groupby("machine_id").agg(
        days=("gaming_date", "nunique"), h=("h", "sum"), occ=("occ", "sum"), theo=("theo", "sum"),
        win=("win", "sum"), var=("var", "sum"), e_floor=("e_floor", "sum"), e_game=("e_game", "sum"),
        e_loc=("e_loc", "sum"), theme=("theme", "first"),
        zones=("zone_name", lambda s: sorted(set(s))), banks=("bank_id", lambda s: sorted(set(s))))
    per["benchmark"] = bench
    per["exposure"] = per.e_floor - bench
    per["game"] = per.e_game - per.e_floor
    per["location"] = per.e_loc - per.e_game
    per["machine"] = per.theo - per.e_loc
    per["luck"] = per.win - per.theo
    per["gap"] = per.win - bench
    per["luck_z"] = per.luck / np.sqrt(per["var"])
    per["machine_factor"] = per.theo / per.e_loc
    per["location_factor"] = per.e_loc / per.e_game

    # Weekly block bootstrap of the machine factor: resample a machine's own weeks.
    wk = d.groupby(["machine_id", "week"])[["theo", "e_loc"]].sum().reset_index()
    rng = np.random.default_rng(seed)
    lo, hi = {}, {}
    for mid, g in wk.groupby("machine_id"):
        t, e = g.theo.to_numpy(), g.e_loc.to_numpy()
        w = rng.multinomial(len(t), np.full(len(t), 1 / len(t)), size=draws)
        r = (w @ t) / (w @ e)
        lo[mid], hi[mid] = np.quantile(r, [0.025, 0.975])
    per["machine_ci_low"], per["machine_ci_high"] = pd.Series(lo), pd.Series(hi)
    per["occupancy"] = per.occ / per.h
    return per.reset_index()


def headline(per: pd.DataFrame) -> str:
    """Which component explains most of the shortfall."""
    parts = per[COMPONENTS]
    return parts.idxmin(axis=1)


def build_report(start: str = "2025-01-01", end: str = "2025-06-30") -> dict:
    per = decompose(start, end)
    per["main_cause"] = headline(per)
    gm10 = m.manager_bottom10(start, end).machine_id.tolist()
    sel = per.set_index("machine_id")

    # Machine-specific weakness after location: interval entirely below 1.
    weak = per[per.machine_ci_high < 1].sort_values("machine_factor")
    zone_rows = _rows(start, end)
    zone_rows["g_all"] = zone_rows.groupby(["gaming_date", "config_id"]).theo.transform("sum") / zone_rows.groupby(
        ["gaming_date", "config_id"]).h.transform("sum")
    zone_rows["mix"] = zone_rows.h * zone_rows.g_all
    zones = zone_rows.groupby(["zone_id", "zone_name"]).agg(theo=("theo", "sum"), mix=("mix", "sum"), h=("h", "sum"))
    zones["location_factor"] = zones.theo / zones.mix
    zones["theo_shortfall_vs_mix"] = zones.theo - zones.mix
    monthly = zone_rows.groupby(["zone_name", "month"]).agg(theo=("theo", "sum"), mix=("mix", "sum"))
    monthly["location_factor"] = monthly.theo / monthly.mix

    def row(mid):
        r = sel.loc[mid]
        return {"machine_id": mid, "theme": r.theme, "zones": r.zones, "banks": r.banks, "days": int(r.days),
                "available_hours": round(float(r.h), 2), "actual_win": round(float(r.win), 2),
                "theo": round(float(r.theo), 2), "benchmark": round(float(r.benchmark), 2),
                "gap": round(float(r.gap), 2), **{c: round(float(r[c]), 2) for c in COMPONENTS},
                "main_cause": r.main_cause, "luck_z": round(float(r.luck_z), 3),
                "machine_factor": round(float(r.machine_factor), 4),
                "machine_ci": [round(float(r.machine_ci_low), 4), round(float(r.machine_ci_high), 4)],
                "location_factor": round(float(r.location_factor), 4), "occupancy": round(float(r.occupancy), 4)}

    gm = [row(x) for x in gm10]
    totals = {c: round(float(sum(r[c] for r in gm)), 2) for c in COMPONENTS + ["gap"]}
    shares = {c: totals[c] / totals["gap"] for c in COMPONENTS}
    bf = next(z for z in zones.reset_index().to_dict("records") if z["zone_name"] == "Back Forty")
    bf_months = {mo: round(float(v.location_factor), 3) for (z, mo), v in monthly.iterrows() if z == "Back Forty"}
    in_bf = sum("Back Forty" in r["zones"] for r in gm)
    evidence = [
        {"id": "q1-decomposition", "title": "The GM's ten are not weak machines",
         "source": "prepared_daily_view + machine_day + game_math; src/q1_decomposition.py::decompose. Leave-one-out daily floor and game rates, monthly zone factors on dated locations.",
         "method": "Gap to an average machine = exposure + game + location + machine + luck, an exact identity (max error "
                   f"{float((per[COMPONENTS].sum(axis=1) - per.gap).abs().max()):.1e} USD).",
         "result": (f"The ten earned ${-totals['gap']:,.0f} less than ten average machines: game math {shares['game']:.0%}, location {shares['location']:.0%}, "
                    f"short exposure {shares['exposure']:.0%}, luck/payout {shares['luck']:.0%}. The machines themselves earned ${totals['machine']:,.0f} more than same-game machines in the same zones. "
                    f"{in_bf} of the ten stand in Back Forty."),
         "alternative": "Game math is a product choice: a low-hold title can still attract play, so replacing it with a higher-hold title is not free.",
         "limitation": "Additive attribution in a fixed order (exposure, game, location, machine); rates are retrospective, and the machine factor is descriptive."},
        {"id": "q1-backforty", "title": "Back Forty earns about a third less than its game mix predicts, every month",
         "source": "prepared_daily_view; src/q1_decomposition.py::build_report (zone theo / sum of hours × same-day game rate)",
         "result": (f"Six-month location factor {float(bf['location_factor']):.3f}: ${-float(bf['theo_shortfall_vs_mix']):,.0f} less theo than its game mix predicts; "
                    "by month " + ", ".join(f"{k[5:]}: {v:.2f}" for k, v in bf_months.items()) + ". The March walkway closure deepened a gap that already existed."),
         "alternative": "Guest mix or the specific games placed there could differ from other zones in ways game rates do not capture.",
         "limitation": "Observational; location factors describe the zone, not the effect of any intervention."},
    ]
    return {
        "evidence": evidence,
        "shares": shares,
        "meta": {"period": [start, end], "machines": int(len(per)), "benchmark_win": round(float(per.benchmark.iloc[0]), 2),
                 "method": __doc__.strip().split("\n\n")[1], "identity_max_error": float(
                     (per[COMPONENTS].sum(axis=1) - per.gap).abs().max())},
        "gm_bottom10": gm,
        "gm_bottom10_totals": totals,
        "gm_main_causes": pd.Series([r["main_cause"] for r in gm]).value_counts().to_dict(),
        "machine_weak_after_location": [row(x) for x in weak.machine_id],
        "zones": [{"zone_id": z, "zone_name": n, "location_factor": round(float(v.location_factor), 4),
                   "theo_vs_game_mix": round(float(v.theo_shortfall_vs_mix), 2), "available_hours": round(float(v.h), 1)}
                  for (z, n), v in zones.sort_values("location_factor").iterrows()],
        "zone_monthly": [{"zone_name": z, "month": mo, "location_factor": round(float(v.location_factor), 4)}
                         for (z, mo), v in monthly.iterrows()],
        "all_machines": [row(x) for x in per.machine_id],
    }


def main() -> None:
    rep = build_report()
    OUT.write_text(json.dumps(rep, indent=1), encoding="utf-8")
    t = rep["gm_bottom10_totals"]
    print(f"benchmark ${rep['meta']['benchmark_win']:,.0f}; identity error {rep['meta']['identity_max_error']:.2e}")
    print("GM ten gap", {k: f"{v:,.0f}" for k, v in t.items()}, rep["gm_main_causes"])
    print("machine-weak after location:", [(r["machine_id"], r["zones"], r["machine_factor"], r["machine_ci"]) for r in rep["machine_weak_after_location"]][:12])
    print("zones:", [(z["zone_name"], z["location_factor"]) for z in rep["zones"]])


if __name__ == "__main__":
    main()
