"""Independent accounting and leakage checks for Q2 / fixed-origin forecasts."""
import numpy as np
import pandas as pd
import pytest

from src import metrics as m
from src.forecast import build_report as forecast_report, retrospective_validation, _rolling_predict, ROLLING_MODELS
from src.q2_demand import monthly_floor, event_associations, closure_comparison


def synthetic_calendar():
    dates=pd.date_range("2025-01-01","2025-06-30")
    return pd.DataFrame({"gaming_date":dates,"coin_in_usd":1000+dates.day_of_week.to_numpy()*100.})


def test_holdout_outcomes_cannot_change_predictions_selection_or_interval():
    base=synthetic_calendar()
    a=forecast_report(base)
    base.loc[base.gaming_date >= "2025-05-01","coin_in_usd"] *= 50
    b=forecast_report(base)
    for key in ("model","constant_prediction_usd","interval_radius_usd","validation_mae"):
        assert a['summary'][key] == b['summary'][key]
    for left,right in zip(a['daily'],b['daily']):
        for key in ('date','prediction','baseline','lower','upper'):
            assert left[key] == right[key]
    assert a['summary']['model_mae'] == 0
    assert b['summary']['model_mae'] > 0


def test_forecast_has_exact_calendar_boundary_and_correct_baseline():
    frame=synthetic_calendar()
    result=forecast_report(frame)
    assert result['summary']['train_days'] == 120
    assert result['summary']['test_days'] == 61
    assert result['daily'][0]['date'] == '2025-05-01'
    assert result['daily'][-1]['date'] == '2025-06-30'
    expected=frame.loc[frame.gaming_date <= '2025-04-30','coin_in_usd'].mean()
    assert all(row['baseline'] == expected for row in result['daily'])


def test_forecast_rejects_missing_or_duplicate_dates():
    frame=synthetic_calendar()
    with pytest.raises(ValueError):
        forecast_report(frame.iloc[1:])
    with pytest.raises(ValueError):
        forecast_report(pd.concat([frame,frame.iloc[[0]]]))


def test_rolling_origins_freeze_all_models_and_bands_before_their_test_block():
    frame = synthetic_calendar()
    original = retrospective_validation(frame)
    cutoff = "2025-05-06"
    changed = frame.copy()
    changed.loc[changed.gaming_date >= cutoff, "coin_in_usd"] *= 50
    mutated = retrospective_validation(changed)
    before = [row for row in original['daily'] if row['origin'] <= cutoff]
    after = [row for row in mutated['daily'] if row['origin'] <= cutoff]
    for left, right in zip(before, after):
        for key in left:
            if key != 'actual':
                assert left[key] == right[key], (left['origin'], left['date'], key)
    for left, right in zip(original['folds'], mutated['folds']):
        if left['origin'] <= cutoff:
            for key in ('selected_model', 'tuning_mae_usd', 'interval_radius_usd', 'candidate_interval_radius_usd'):
                assert left[key] == right[key]
    assert mutated['summary']['mae_usd'] != original['summary']['mae_usd']


def test_rolling_calibration_outcomes_cannot_select_the_model():
    frame = synthetic_calendar()
    original = retrospective_validation(frame)['folds'][0]
    changed = frame.copy()
    in_calibration = changed.gaming_date.between(original['calibration_start'], original['calibration_end'])
    changed.loc[in_calibration, 'coin_in_usd'] += np.arange(in_calibration.sum()) * 1000
    mutated = retrospective_validation(changed)['folds'][0]
    assert original['selected_model'] == mutated['selected_model']
    assert original['tuning_mae_usd'] == mutated['tuning_mae_usd']
    assert original['interval_radius_usd'] != mutated['interval_radius_usd']


def test_rolling_protocol_has_disjoint_windows_and_comparable_horizons():
    result = retrospective_validation(synthetic_calendar())
    assert result['status'] == 'retrospective'
    assert len(result['folds']) == 13
    assert result['summary']['days'] == 91
    assert len({row['date'] for row in result['daily']}) == 91
    assert [row['days'] for row in result['monthly']] == [30, 31, 30]
    assert all(row['days'] == 91 for row in result['models'])
    assert result['daily'][0]['date'] == '2025-04-01'
    assert result['daily'][-1]['date'] == '2025-06-30'
    for fold in result['folds']:
        assert fold['tuning_fit_end'] < fold['tuning_start'] <= fold['tuning_end'] < fold['calibration_start'] <= fold['calibration_end'] < fold['origin']
        assert len(fold['tuning_origins']) == 2
        assert len(fold['calibration_origins']) == 3
        assert fold['calibration_days'] == 21
        assert fold['days'] == 7
        assert (pd.Timestamp(fold['forecast_end']) - pd.Timestamp(fold['origin'])).days == 6
        assert set(fold['candidate_mae_usd']) == set(ROLLING_MODELS)
    weighted_coverage = sum(row['days'] * row['coverage_90'] for row in result['monthly']) / 91
    assert result['summary']['coverage_90'] == pytest.approx(weighted_coverage)


def test_seasonal_naive_repeats_last_observed_week_over_a_fixed_horizon():
    frame = synthetic_calendar()
    frame['coin_in_usd'] += np.arange(len(frame)) * 13
    train = frame[frame.gaming_date < '2025-04-01']
    dates = pd.Series(pd.date_range('2025-04-01', periods=14))
    prediction = _rolling_predict(train, dates, 'seasonal_naive')
    latest = train.groupby(train.gaming_date.dt.day_of_week).coin_in_usd.last()
    assert prediction.tolist() == dates.dt.day_of_week.map(latest).tolist()
    assert prediction[:7].tolist() == prediction[7:].tolist()


def test_frozen_monthly_diagnostics_reconcile_to_original_benchmark():
    result = forecast_report(synthetic_calendar())
    assert [row['days'] for row in result['frozen_monthly']] == [31, 30]
    assert sum(row['days'] * row['mae_usd'] for row in result['frozen_monthly']) / 61 == pytest.approx(result['summary']['model_mae'])
    assert sum(row['days'] * row['bias_usd'] for row in result['frozen_monthly']) / 61 == pytest.approx(result['summary']['model_bias_usd'])
    assert sum(row['days'] * row['coverage_90'] for row in result['frozen_monthly']) / 61 == pytest.approx(result['summary']['coverage_90'])


def test_monthly_demand_reconciles_raw_machine_meter_and_coverage():
    actual=monthly_floor()
    raw=m.sql(f"""SELECT strftime(gaming_date,'%Y-%m') AS month,
                  SUM(coin_in_cents)/100.0 AS coin_in,
                  SUM(available_seconds)/3600.0 AS available_hours
                  FROM {m.table('machine_day')} WHERE active GROUP BY 1 ORDER BY 1""")
    assert actual.days.tolist() == [31,28,31,30,31,30]
    assert np.allclose(actual.coin_in,raw.coin_in)
    assert np.allclose(actual.available_hours,raw.available_hours)
    assert np.allclose(actual.coin_in_per_available_hour,raw.coin_in/raw.available_hours)
    assert actual.counter_coverage.between(0,1).all()
    assert (actual.covered_sensor_hours > 0).all()
    assert (actual.offline_sensor_hours > 0).all()
    # 7 sensors, 23-hour DST gaming date March 8: denominator must not assume 24.
    march=actual[actual.month=='2025-03'].iloc[0]
    assert march.covered_sensor_hours/march.counter_coverage == pytest.approx(7*(31*24-1))


def test_event_windows_have_calendar_support_and_finite_comparisons():
    events=event_associations()
    assert len(events) == 8
    assert all(e['minimum_comparison_days'] >= 1 for e in events)
    assert all(np.isfinite(e['availability_adjusted_difference_pct']) for e in events)
    for event in events:
        assert event['days'] == (pd.Timestamp(event['end'])-pd.Timestamp(event['start'])).days+1


def test_location_periods_follow_walkway_boundaries_and_preserve_money():
    report=closure_comparison()
    assert report['closure_start'] == '2025-03-03'
    assert report['reopening_date'] == '2025-04-07'
    assert report['closure_days'] == 35
    expected=m.sql(f"SELECT SUM(coin_in_cents)/100.0 AS coin_in FROM {m.table('machine_day')} WHERE active").iloc[0].coin_in
    assert sum(r['coin_in'] for r in report['periods']) == pytest.approx(expected)
    assert report['ci95_pct'][0] <= report['ratio_of_ratios_change_pct'] <= report['ci95_pct'][1]
