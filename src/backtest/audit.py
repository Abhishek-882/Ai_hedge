"""Lookahead Bias Detection, Overfitting Audit, and Purged Group Time-Series CV.
"""

from __future__ import annotations

from typing import Any, Callable
import numpy as np
import pandas as pd


class LookaheadBiasAuditor:
    """Detects feature shift leakage, forward indexing bugs, and train-test contamination."""

    @staticmethod
    def audit_features(
        df: pd.DataFrame,
        feature_cols: list[str],
        target_col: str,
        time_col: str = "timestamp_ms",
    ) -> dict[str, Any]:
        """Verify that features do not contain future leakage by checking correlation with lead values."""
        if df.empty or target_col not in df.columns:
            return {"passed": True, "flagged_features": []}

        # Check time sorting
        if time_col in df.columns:
            is_sorted = df[time_col].is_monotonic_increasing
            if not is_sorted:
                return {
                    "passed": False,
                    "reason": f"DataFrame is not monotonically sorted by {time_col}.",
                    "flagged_features": feature_cols,
                }

        flagged = []
        target = df[target_col].values

        for col in feature_cols:
            if col not in df.columns:
                continue
            vals = df[col].values

            # Check if feature has perfect correlation with target (possible unshifted label)
            if np.all(np.isfinite(vals)) and np.all(np.isfinite(target)):
                corr = np.corrcoef(vals, target)[0, 1]
                if abs(corr) > 0.9999 and col != target_col:
                    flagged.append({
                        "feature": col,
                        "issue": "Near-perfect correlation with target (>0.9999). Likely unshifted feature.",
                        "correlation": round(float(corr), 4),
                    })

        return {
            "passed": len(flagged) == 0,
            "flagged_features": flagged,
            "total_features_audited": len(feature_cols),
        }

    @staticmethod
    def verify_no_future_leakage(
        train_df: pd.DataFrame,
        test_df: pd.DataFrame,
        time_col: str = "timestamp_ms",
        embargo_hours: float = 8.0,
    ) -> dict[str, Any]:
        """Verify that test dataset is strictly subsequent to train dataset plus the 8h embargo period."""
        if train_df.empty or test_df.empty:
            return {"passed": True, "embargo_compliant": True}

        max_train_ts = train_df[time_col].max()
        min_test_ts = test_df[time_col].min()
        embargo_ms = int(embargo_hours * 3600 * 1000)

        gap_ms = min_test_ts - max_train_ts
        is_separated = bool(min_test_ts > max_train_ts)
        has_embargo = bool(gap_ms >= embargo_ms)
        passed = bool(is_separated and has_embargo)

        return {
            "passed": passed,
            "is_strictly_separated": is_separated,
            "embargo_compliant": has_embargo,
            "gap_hours": round(float(gap_ms) / (3600 * 1000.0), 2),
            "required_embargo_hours": embargo_hours,
        }

    @staticmethod
    def purged_group_time_series_split(
        df: pd.DataFrame,
        n_splits: int = 4,
        embargo_hours: float = 8.0,
        time_col: str = "timestamp_ms",
    ) -> list[tuple[np.ndarray, np.ndarray]]:
        """Purged group time-series CV splits with 8-hour settlement embargo between folds."""
        n_samples = len(df)
        if n_samples < n_splits * 2:
            raise ValueError(f"Sample size {n_samples} too small for {n_splits} splits.")

        embargo_ms = int(embargo_hours * 3600 * 1000)
        timestamps = df[time_col].values if time_col in df.columns else np.arange(n_samples)

        indices = np.arange(n_samples)
        fold_size = n_samples // (n_splits + 1)
        splits = []

        for i in range(1, n_splits + 1):
            train_end_idx = i * fold_size
            train_idx = indices[:train_end_idx]

            # Apply embargo
            train_max_ts = timestamps[train_end_idx - 1]
            test_start_mask = (timestamps >= (train_max_ts + embargo_ms)) & (indices > train_end_idx)
            test_idx = indices[test_start_mask][:fold_size]

            if len(test_idx) > 0:
                splits.append((train_idx, test_idx))

        return splits


class OverfittingAuditor:
    """Evaluates parameter fragility and over-optimization across parameter perturbations."""

    @staticmethod
    def audit_parameter_sensitivity(
        runner_fn: Callable[[dict[str, Any]], float],
        base_params: dict[str, Any],
        param_grid: dict[str, list[Any]],
        max_acceptable_cv: float = 0.35,  # Max 35% coefficient of variation
    ) -> dict[str, Any]:
        """Test strategy stability under parameter perturbations."""
        base_metric = runner_fn(base_params)
        results = []

        for param_name, variations in param_grid.items():
            param_scores = []
            for val in variations:
                test_params = dict(base_params)
                test_params[param_name] = val
                score = runner_fn(test_params)
                param_scores.append(score)

            arr = np.array(param_scores)
            mean_score = float(np.mean(arr))
            std_score = float(np.std(arr))
            cv = (std_score / abs(mean_score)) if abs(mean_score) > 1e-6 else 0.0

            results.append({
                "param_name": param_name,
                "base_value": base_params.get(param_name),
                "tested_values": variations,
                "mean_score": round(mean_score, 4),
                "std_score": round(std_score, 4),
                "coefficient_of_variation": round(cv, 4),
                "is_stable": cv <= max_acceptable_cv,
            })

        all_stable = all(r["is_stable"] for r in results)
        return {
            "passed": all_stable,
            "base_metric": base_metric,
            "parameter_audits": results,
        }
