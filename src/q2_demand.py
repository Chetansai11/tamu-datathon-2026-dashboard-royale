"""Demand: calendar-normalized floor trends, event associations, location test.

Run ``python -m src.q2_demand``. Context tables are used retrospectively only;
the public report contains derived observations and source links, not copies
of publisher tables whose redistribution is not cleared in SOURCES.md.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from src import metrics as m


def records(frame):
    return json.loads(frame.to_json(orient="records", date_format="iso"))


def monthly_floor():
    return m.sql(f"""
        WITH hours AS (SELECT month, SUM(scheduled_hours) AS scheduled_hours FROM floor GROUP BY month),
        traffic AS (SELECT strftime(hour_start_local - INTERVAL '6 hours','%Y-%m') AS month,
                   SUM(entries_count) AS observed_entries, SUM(coverage_minutes)/60.0 AS covered_hours,
                   COUNT(*) AS sensor_hours, COUNT(*) FILTER (WHERE counter_status='offline') AS offline_sensor_hours
                   FROM {m.table('zone_traffic_hourly')} GROUP BY 1)
        SELECT strftime(p.gaming_date,'%Y-%m') AS month, COUNT(*) AS days,
          SUM(p.coin_in_usd)::DOUBLE AS coin_in, AVG(p.coin_in_usd)::DOUBLE AS coin_in_per_day,
          AVG(p.active_machines) AS average_active_machines,
          SUM(p.available_machine_hours) AS available_hours, SUM(p.occupied_machine_hours) AS occupied_hours,
          SUM(p.coin_in_usd)/SUM(p.available_machine_hours) AS coin_in_per_available_hour,
          SUM(p.coin_in_usd)/SUM(p.occupied_machine_hours) AS coin_in_per_occupied_hour,
          SUM(p.occupied_machine_hours)/SUM(p.available_machine_hours) AS occupancy,
          SUM(p.available_machine_hours)/ANY_VALUE(h.scheduled_hours) AS availability,
          ANY_VALUE(t.observed_entries) AS observed_entries, ANY_VALUE(t.covered_hours) AS covered_sensor_hours,
          ANY_VALUE(t.observed_entries)/ANY_VALUE(t.covered_hours) AS entries_per_covered_hour,
          ANY_VALUE(t.covered_hours)/ANY_VALUE(t.sensor_hours) AS counter_coverage,
          ANY_VALUE(t.offline_sensor_hours) AS offline_sensor_hours,
          SUM(p.theo_usd)::DOUBLE AS theo, SUM(p.house_win_usd)::DOUBLE AS house_win
        FROM {m.table('property_day')} p JOIN hours h ON h.month=strftime(p.gaming_date,'%Y-%m')
        JOIN traffic t ON t.month=h.month GROUP BY 1 ORDER BY 1
    """)


def event_associations():
    daily = m.sql(f"SELECT * FROM {m.table('property_day')} ORDER BY gaming_date")
    daily["month"] = daily.gaming_date.dt.strftime("%Y-%m")
    daily["dow"] = daily.gaming_date.dt.day_of_week
    daily["coin_hour"] = daily.coin_in_usd / daily.available_machine_hours
    nonevent = daily[daily.events_active.isna() | (daily.events_active == "")]
    strata = nonevent.groupby(["month","dow"]).agg(coin=("coin_in_usd","mean"), hour=("coin_hour","mean"), n=("gaming_date","count"))
    events = m.sql(f"SELECT * FROM {m.table('events')} ORDER BY start_date")
    results=[]
    for event in events.itertuples():
        days=daily[daily.gaming_date.between(event.start_date,event.end_date)]
        bases=[strata.loc[(r.month,r.dow)] for r in days.itertuples()]
        expected=sum(float(x.coin) for x in bases)
        expected_rate=sum(float(x.hour)*float(r.available_machine_hours) for x,r in zip(bases,days.itertuples()))
        actual=float(days.coin_in_usd.sum())
        results.append({"event_id":event.event_id,"name":event.name,"start":event.start_date.strftime("%Y-%m-%d"),"end":event.end_date.strftime("%Y-%m-%d"),
                        "days":len(days),"coin_in":actual,"matched_expected_coin_in":expected,"difference_pct":(actual/expected-1)*100,
                        "availability_adjusted_difference_pct":(actual/expected_rate-1)*100,"minimum_comparison_days":min(int(x.n) for x in bases),
                        "scope":event.local_scope,"source_type":event.source_type,
                        "limitation":"Association versus same-month same-weekday non-event days, not incremental promotion ROI; small event samples and co-occurring changes."})
    return results


def closure_comparison():
    # Intervals are from floor_walkways, not chosen by inspecting the outcome.
    closure=m.sql(f"SELECT * FROM {m.table('floor_walkways')} WHERE closed_from_utc IS NOT NULL")
    if len(closure)!=1:
        raise ValueError("Expected the supplied single walkway closure; review methodology for a changed release")
    edge=closure.iloc[0]
    start=pd.Timestamp(edge.closed_from_utc).tz_localize("UTC").tz_convert("America/Los_Angeles").date().isoformat()
    end=pd.Timestamp(edge.closed_to_utc).tz_localize("UTC").tz_convert("America/Los_Angeles").date().isoformat()
    daily=m.sql("""SELECT gaming_date, zone_id, SUM(coin_in_usd)::DOUBLE AS coin_in,
                 SUM(available_hours) AS available_hours, SUM(scheduled_hours) AS scheduled_hours
                 FROM floor GROUP BY 1,2 ORDER BY 1,2""")
    daily["period"]=np.where(daily.gaming_date < start,"before",np.where(daily.gaming_date < end,"closed","reopened"))
    daily["group"]=np.where(daily.zone_id=="Z-B40","Back Forty","Other zones")
    aggregate=daily.groupby(["period","group"])[["coin_in","available_hours","scheduled_hours"]].sum().reset_index()
    aggregate["coin_in_per_available_hour"]=aggregate.coin_in/aggregate.available_hours
    aggregate["availability"]=aggregate.available_hours/aggregate.scheduled_hours
    values=aggregate.set_index(["period","group"]).coin_in_per_available_hour
    ratios={p:float(values[p,"Back Forty"]/values[p,"Other zones"]) for p in ["before","closed","reopened"]}
    effect=(ratios["closed"]/ratios["before"]-1)*100
    recovery=(ratios["reopened"]/ratios["before"]-1)*100
    # Date is resampled jointly across affected/control groups, in 7-day blocks.
    rng=np.random.default_rng(2025)
    series=daily.groupby(["period","gaming_date","group"])[["coin_in","available_hours"]].sum()
    period_arrays={}
    for period in ["before","closed"]:
        s=series.loc[period].unstack("group")
        period_arrays[period]=s[[('coin_in','Back Forty'),('available_hours','Back Forty'),('coin_in','Other zones'),('available_hours','Other zones')]].to_numpy()
    boot=[]
    for _ in range(1500):
        br={}
        for period,arr in period_arrays.items():
            n=len(arr); length=min(7,n)
            idx=(rng.integers(0,n-length+1,int(np.ceil(n/length)))[:,None]+np.arange(length)).ravel()[:n]
            a=arr[idx].sum(axis=0)
            br[period]=(a[0]/a[1])/(a[2]/a[3])
        boot.append((br['closed']/br['before']-1)*100)
    ci=np.quantile(boot,[.025,.975]).tolist()
    pretrend=m.sql("""SELECT month,
       (SUM(CASE WHEN zone_id='Z-B40' THEN coin_in_usd ELSE 0 END)/SUM(CASE WHEN zone_id='Z-B40' THEN available_hours ELSE 0 END)) /
       (SUM(CASE WHEN zone_id!='Z-B40' THEN coin_in_usd ELSE 0 END)/SUM(CASE WHEN zone_id!='Z-B40' THEN available_hours ELSE 0 END)) AS relative_rate
       FROM floor WHERE month IN ('2025-01','2025-02') GROUP BY 1 ORDER BY 1""")
    placebo=(float(pretrend.iloc[1].relative_rate)/float(pretrend.iloc[0].relative_rate)-1)*100
    return {"walkway_id":str(edge.walkway_id),"closure_start":start,"reopening_date":end,"closure_days":(pd.Timestamp(end)-pd.Timestamp(start)).days,
            "affected_zone":"Z-B40","control":"all other zones","ratio_of_ratios_change_pct":effect,"ci95_pct":ci,
            "preclosure_jan_to_feb_relative_change_pct":placebo,
            "reopened_relative_to_before_pct":recovery,"periods":records(aggregate),
            "limitation":"Observational location contrast: requires parallel trends, no spillovers and stable game/guest mix; these are not guaranteed. Other zones may receive displaced play. No causal uplift is promised."}


def build_report():
    monthly=monthly_floor()
    zones=m.summarize(["zone_id","zone_name","month"])
    zone_fields=["zone_id","zone_name","month","coin_in","coin_in_per_avail_hour","availability","occupancy","machine_days","available_hours"]
    events=event_associations()
    closure=closure_comparison()
    first,last=monthly.iloc[0],monthly.iloc[-1]
    change=(last.coin_in_per_day/first.coin_in_per_day-1)*100
    hour_change=(last.coin_in_per_available_hour/first.coin_in_per_available_hour-1)*100
    traffic_change=(last.entries_per_covered_hour/first.entries_per_covered_hour-1)*100
    city=m.sql(f"SELECT * FROM {m.table('city_visitation_monthly')} ORDER BY month")
    city_change=(float(city.iloc[-1].mean_visitors_per_calendar_day)/float(city.iloc[0].mean_visitors_per_calendar_day)-1)*100
    weather=m.sql(f"SELECT strftime(source_date,'%Y-%m') AS month, AVG(tmax_c)::DOUBLE AS mean_tmax_c FROM {m.table('weather_daily')} WHERE COALESCE(tmax_qflag,'')='' GROUP BY 1 ORDER BY 1")
    headline=f"June daily play is {abs(change):.1f}% {'below' if change<0 else 'above'} January; Back Forty shows a separate closure dip"
    summary={"headline":headline,"decision":"Separate temporary access pressure from machine quality; use quieter calendar days for maintenance and monitor Back Forty after access returns.",
             "jan_daily_coin_in":float(first.coin_in_per_day),"jun_daily_coin_in":float(last.coin_in_per_day),"jan_to_jun_daily_change_pct":change,
             "jan_to_jun_available_hour_change_pct":hour_change,"jan_to_jun_coverage_adjusted_traffic_change_pct":traffic_change,
             "jan_average_active_machines":float(first.average_active_machines),"jun_average_active_machines":float(last.average_active_machines),
             "closure_relative_change_pct":closure['ratio_of_ratios_change_pct'],"city_daily_visitation_change_pct":city_change}
    evidence=[{"id":"demand-trend","claim":headline,"source":"property_day, prepared_daily_view, calendar_day; src/q2_demand.py:monthly_floor",
               "method":"Monthly coin-in / gaming days; coin-in / summed available hours; occupancy and availability are ratios of sums.",
               "result":f"Jan ${first.coin_in_per_day:,.0f}/day vs Jun ${last.coin_in_per_day:,.0f}/day ({change:+.2f}%); per available hour {hour_change:+.2f}%. Active machines {first.average_active_machines:.0f} vs {last.average_active_machines:.0f}; availability {first.availability:.2%} vs {last.availability:.2%}.",
               "alternative":"More floor capacity, event mix or changing wager sizes can alter raw totals independently of underlying visits.",
               "limitation":"Six months, synthetic property; coin-in includes replay and is not cash spent or profit."},
              {"id":"demand-traffic","claim":"Coverage-adjusted traffic is a separate demand check","source":"zone_traffic_hourly; src/q2_demand.py:monthly_floor",
               "method":"Assign local timestamps to gaming dates by subtracting six hours; sum observed entries / sum covered sensor hours. Offline is not zero.",
               "result":f"Jan {first.entries_per_covered_hour:.2f} versus Jun {last.entries_per_covered_hour:.2f} crossings per covered sensor-hour ({traffic_change:+.2f}%); coverage {first.counter_coverage:.2%} vs {last.counter_coverage:.2%}.",
               "alternative":"Crossings can fall because access paths or time spent seated changed, without fewer guests.",
               "limitation":"Sensors count crossings, not unique visitors. Coverage correction assumes missing hours are comparable and may not remove bias."},
              {"id":"demand-location","claim":"Back Forty declines disproportionately during the documented walkway closure","source":"floor_walkways, prepared_daily_view; src/q2_demand.py:closure_comparison",
               "method":"Back Forty coin-in/available-hour divided by other zones' same rate; compare Jan 1-Mar 2 against Mar 3-Apr 6. Paired date blocks of 7 days; 1,500 bootstrap draws.",
               "result":f"Relative rate changed {closure['ratio_of_ratios_change_pct']:+.2f}% (descriptive 95% interval {closure['ci95_pct'][0]:+.2f}% to {closure['ci95_pct'][1]:+.2f}%); reopened-period difference from before {closure['reopened_relative_to_before_pct']:+.2f}%. Preclosure January-February placebo change {closure['preclosure_jan_to_feb_relative_change_pct']:+.2f}%.",
               "alternative":"Guest/game mix and displacement to control zones can also explain the contrast.","limitation":closure['limitation']},
              {"id":"demand-events","claim":"Event-day lifts are associations, not measured promotion returns","source":"events, property_day; src/q2_demand.py:event_associations",
               "method":"Each event day compared with the mean of non-event days in the same month and weekday; also adjust baseline for actual available hours.",
               "result":"Eight event windows evaluated with matched calendar baselines; see event table for actual and expected coin-in.",
               "alternative":"Weather, guest mix and other calendar changes can confound event associations.","limitation":"Few event days; no randomized control, no customer acquisition cost, and no causal ROI."},
              {"id":"demand-context","claim":"City tourism softness is consistent with, but cannot identify, the property's demand change","source":"city_visitation_monthly; LVCVA 2025 revised workbook; weather_daily NOAA USW00023169",
               "method":"Compare derived January-June daily visitor intensity, never raw monthly totals. Inspect NOAA calendar-day temperature as context only.",
               "result":f"Bundled LVCVA daily visitor intensity Jan-to-Jun {city_change:+.2f}%; NOAA mean daily maximum {weather.iloc[0].mean_tmax_c:.1f}C in Jan vs {weather.iloc[-1].mean_tmax_c:.1f}C in Jun.",
               "alternative":"This fictional property's promotions, access and guest mix need not follow destination tourism or weather.",
               "limitation":"Retrospective external sources were not knowable at a 2025 forecast origin. Calendar weather and gaming dates differ. Raw LVCVA and Missouri tables are not redistributed."}]
    sources=[{"name":"LVCVA tourism indicators","url":"https://www.lvcva.com/research/reports/post/lvcva-executive-summary-of-southern-nevada-tourism-indicators/","use":"Publisher landing page verified live; derived numeric comparison uses the bundled source-provenanced 2026-08-20 revision, not a forecast feature."},
             {"name":"LVCVA 2025 workbook (bundled source URL)","url":str(city.iloc[0].source_url),"use":"Retrospective context only. Direct workbook retrieval via browser tool was unavailable; no raw table republished."},
             {"name":"NOAA daily summaries API, Las Vegas airport","url":"https://www.ncei.noaa.gov/access/services/data/v1?dataset=daily-summaries&stations=USW00023169&startDate=2025-01-01&endDate=2025-06-30&dataTypes=TMAX,TMIN,PRCP&units=metric&format=csv&includeAttributes=true","use":"Bundled source-provenanced weather, calendar-day context only. Live endpoint retrieval unavailable."}]
    return {"summary":summary,"monthly":records(monthly),"zones_monthly":records(zones[zone_fields]),"events":events,"closure":closure,"evidence":evidence,"sources":sources}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--output",default="outputs/q2_demand.json")
    args=parser.parse_args()
    report=build_report()
    path=Path(args.output); path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(report,indent=2,allow_nan=False),encoding="utf-8")
    print(json.dumps(report['summary'],indent=2))
    print(json.dumps(report['closure'],indent=2))


if __name__=="__main__":
    main()
