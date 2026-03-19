"""
ZonForge Sentinel — Anomaly Service Unit Tests

Tests for statistical helper functions and detector logic.
These tests run without requiring live database connections.
"""
from __future__ import annotations

import math
import pytest

from src.models.baseline import (
    compute_hourly_distribution,
    compute_mean_std,
    compute_zscore,
    hour_distribution_anomaly_score,
    zscore_to_confidence,
    zscore_to_severity,
)


# ── compute_mean_std ──────────────────────────────────────────────

class TestComputeMeanStd:
    def test_empty_list(self) -> None:
        mean, std = compute_mean_std([])
        assert mean == 0.0
        assert std  == 0.0

    def test_single_value(self) -> None:
        mean, std = compute_mean_std([5.0])
        assert mean == 5.0
        assert std  == 0.0

    def test_uniform_values(self) -> None:
        mean, std = compute_mean_std([3.0, 3.0, 3.0, 3.0])
        assert mean == 3.0
        assert std  == 0.0

    def test_typical_distribution(self) -> None:
        values = [10.0, 12.0, 14.0, 8.0, 11.0, 13.0]
        mean, std = compute_mean_std(values)
        assert abs(mean - 11.333) < 0.01
        assert std > 0

    def test_high_variance(self) -> None:
        values = [0.0, 100.0, 0.0, 100.0]
        mean, std = compute_mean_std(values)
        assert mean == 50.0
        assert std  == 50.0


# ── compute_zscore ────────────────────────────────────────────────

class TestComputeZScore:
    def test_zero_std_dev_returns_zero(self) -> None:
        assert compute_zscore(10.0, 10.0, 0.0) == 0.0

    def test_at_mean_is_zero(self) -> None:
        assert compute_zscore(50.0, 50.0, 10.0) == 0.0

    def test_one_std_dev_above(self) -> None:
        z = compute_zscore(60.0, 50.0, 10.0)
        assert abs(z - 1.0) < 1e-9

    def test_two_std_dev_below(self) -> None:
        z = compute_zscore(30.0, 50.0, 10.0)
        assert abs(z - (-2.0)) < 1e-9

    def test_high_anomaly(self) -> None:
        # 1000 API calls vs baseline mean of 50, std 20
        z = compute_zscore(1000.0, 50.0, 20.0)
        assert z > 10.0   # Extreme anomaly


# ── zscore_to_confidence ──────────────────────────────────────────

class TestZScoreToConfidence:
    def test_below_threshold_is_zero(self) -> None:
        assert zscore_to_confidence(1.5) == 0.0
        assert zscore_to_confidence(-1.9) == 0.0

    def test_at_threshold_is_base(self) -> None:
        conf = zscore_to_confidence(2.0, base_confidence=0.70)
        assert abs(conf - 0.70) < 0.01

    def test_increases_with_z_score(self) -> None:
        c2 = zscore_to_confidence(2.0)
        c3 = zscore_to_confidence(3.0)
        c4 = zscore_to_confidence(4.0)
        assert c2 < c3 < c4

    def test_caps_at_max(self) -> None:
        conf = zscore_to_confidence(100.0)
        assert conf <= 0.97

    def test_negative_zscore(self) -> None:
        # Negative z-scores use abs value
        c_pos = zscore_to_confidence(3.0)
        c_neg = zscore_to_confidence(-3.0)
        assert abs(c_pos - c_neg) < 1e-9


# ── zscore_to_severity ────────────────────────────────────────────

class TestZScoreToSeverity:
    def test_low_severity(self) -> None:
        assert zscore_to_severity(2.3) == "low"

    def test_medium_severity(self) -> None:
        assert zscore_to_severity(3.0) == "medium"
        assert zscore_to_severity(3.9) == "medium"

    def test_high_severity(self) -> None:
        assert zscore_to_severity(4.0) == "high"
        assert zscore_to_severity(10.0) == "high"

    def test_negative_values(self) -> None:
        assert zscore_to_severity(-4.5) == "high"


# ── compute_hourly_distribution ───────────────────────────────────

class TestComputeHourlyDistribution:
    def test_empty(self) -> None:
        dist = compute_hourly_distribution([])
        assert dist == {}

    def test_all_same_hour(self) -> None:
        dist = compute_hourly_distribution([9, 9, 9, 9])
        assert dist[9]  == 1.0
        assert dist[10] == 0.0

    def test_even_distribution(self) -> None:
        hours = list(range(24))   # one login per hour
        dist  = compute_hourly_distribution(hours)
        for h in range(24):
            assert abs(dist[h] - 1/24) < 1e-9

    def test_business_hours_pattern(self) -> None:
        # Typical 9-17 worker
        hours = [9, 10, 10, 11, 14, 15, 16, 9, 10, 11]
        dist  = compute_hourly_distribution(hours)
        assert dist.get(10, 0) > dist.get(2, 0)
        assert dist.get(2, 0) == 0.0


# ── hour_distribution_anomaly_score ──────────────────────────────

class TestHourAnomalyScore:
    def test_common_hour_low_score(self) -> None:
        dist  = {9: 0.3, 10: 0.4, 11: 0.2, 14: 0.1}
        score = hour_distribution_anomaly_score(10, dist)
        assert score < 0.3   # Most common hour = low anomaly

    def test_unseen_hour_high_score(self) -> None:
        dist  = {9: 0.5, 10: 0.3, 11: 0.2}
        score = hour_distribution_anomaly_score(3, dist)
        assert score > 0.8   # 3 AM never seen = high anomaly

    def test_smoothing_prevents_zero(self) -> None:
        # Without smoothing, prob=0 would give anomaly=1.0 exactly
        dist  = {9: 0.5, 10: 0.5}
        score = hour_distribution_anomaly_score(2, dist, smoothing=0.01)
        assert 0.9 < score < 1.0


# ── Integration: full detection scenario ─────────────────────────

class TestDetectionScenario:
    def test_attack_scenario_brute_force_timing(self) -> None:
        """
        Attacker logs in at 3 AM on a weekday.
        User's baseline: logins between 8 AM - 6 PM only.
        """
        business_hours = [9, 9, 10, 10, 10, 11, 14, 15, 16, 9, 10]
        dist  = compute_hourly_distribution(business_hours)
        score = hour_distribution_anomaly_score(3, dist)   # 3 AM

        # Should be flagged as highly anomalous
        assert score > 0.85

        z_score    = score * 4.0
        confidence = zscore_to_confidence(z_score, base_confidence=0.70)
        severity   = zscore_to_severity(z_score)

        assert confidence > 0.85
        assert severity in ("medium", "high")

    def test_api_abuse_volume(self) -> None:
        """
        Attacker using stolen API key makes 5000 API calls/hour.
        Baseline: 50 calls/hour mean, std dev 15.
        """
        z_score    = compute_zscore(5000.0, 50.0, 15.0)
        confidence = zscore_to_confidence(z_score)
        severity   = zscore_to_severity(z_score)

        assert z_score > 300.0       # Extreme outlier
        assert confidence > 0.95     # Very high confidence
        assert severity == "high"
