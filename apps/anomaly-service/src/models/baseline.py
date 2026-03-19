"""
ZonForge Sentinel — Baseline Data Models & Statistical Helpers

Every per-user metric has a baseline derived from 30-day
rolling activity. New observations are compared against
the baseline using z-score deviation.

Baseline schema mirrors the anomaly_baselines PostgreSQL table.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID


# ── Baseline record (mirrors DB schema) ──────────────────────────

@dataclass
class Baseline:
    tenant_id:      str
    user_id:        str
    metric_name:    str
    baseline_data:  dict[str, Any]
    sample_count:   int
    mean_value:     float | None
    std_dev_value:  float | None
    last_updated_at: datetime
    valid_from_date: datetime


# ── Anomaly signal produced by a detector ────────────────────────

@dataclass
class AnomalySignal:
    tenant_id:        str
    user_id:          str
    entity_id:        str
    entity_type:      str
    metric_name:      str
    observed_value:   float
    baseline_mean:    float
    baseline_std_dev: float
    z_score:          float
    confidence:       float
    severity:         str
    description:      str
    evidence_event_ids: list[str] = field(default_factory=list)
    metadata:         dict[str, Any] = field(default_factory=dict)

    @property
    def is_anomalous(self) -> bool:
        return abs(self.z_score) >= 2.0


# ── Statistical helper functions ──────────────────────────────────

def compute_zscore(observed: float, mean: float, std_dev: float) -> float:
    """
    Compute z-score: how many standard deviations from mean.
    Returns 0.0 if std_dev is 0 (no variance in baseline).
    """
    if std_dev <= 0.0:
        return 0.0
    return (observed - mean) / std_dev


def zscore_to_confidence(z_score: float, base_confidence: float = 0.70) -> float:
    """
    Map z-score magnitude to a [0.0, 1.0] confidence value.

    Z-score  →  Confidence
    2.0      →  base (e.g. 0.70)
    2.5      →  0.78
    3.0      →  0.85
    4.0      →  0.92
    5.0+     →  0.97
    """
    abs_z = abs(z_score)
    if abs_z < 2.0:
        return 0.0
    # Sigmoid-like scaling from 2.0 to 5.0
    scale = min((abs_z - 2.0) / 3.0, 1.0)
    max_confidence = 0.97
    return base_confidence + (max_confidence - base_confidence) * scale


def zscore_to_severity(z_score: float) -> str:
    """
    Map z-score magnitude to alert severity.
    """
    abs_z = abs(z_score)
    if abs_z >= 4.0:
        return "high"
    if abs_z >= 3.0:
        return "medium"
    return "low"


def compute_mean_std(values: list[float]) -> tuple[float, float]:
    """Compute mean and population std deviation."""
    if not values:
        return 0.0, 0.0
    n    = len(values)
    mean = sum(values) / n
    if n < 2:
        return mean, 0.0
    variance = sum((v - mean) ** 2 for v in values) / n
    return mean, math.sqrt(variance)


def compute_hourly_distribution(hours: list[int]) -> dict[int, float]:
    """
    Build a probability distribution over 24 hours.
    Returns dict: {hour: probability}
    """
    if not hours:
        return {}
    total = len(hours)
    dist: dict[int, float] = {}
    for h in range(24):
        dist[h] = hours.count(h) / total
    return dist


def hour_distribution_anomaly_score(
    observed_hour: int,
    distribution:  dict[int, float],
    smoothing:     float = 0.01,   # Laplace smoothing
) -> float:
    """
    Score how anomalous an observed hour is given the historical distribution.
    Returns a value in [0, 1] — higher = more anomalous.
    """
    if not distribution:
        return 0.0
    prob = distribution.get(observed_hour, 0.0)
    # Smooth to avoid zero-probability for unseen hours
    smoothed = prob + smoothing
    # Anomaly score = 1 - normalized probability
    max_prob  = max(distribution.values()) + smoothing
    return 1.0 - (smoothed / max_prob)
