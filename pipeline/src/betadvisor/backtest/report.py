"""Plots and the Markdown report for a backtest run."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt  # noqa: E402

from betadvisor.backtest.bankroll import BankrollResult  # noqa: E402

SIM_LABELS = {
    "pre_match_avg": "Pre-match market-average odds",
    "closing_avg": "Closing market-average odds",
}


def plot_calibration(metrics: dict[str, Any], path: Path) -> None:
    fig, (ax, hist) = plt.subplots(
        2, 1, figsize=(6, 7), height_ratios=[3, 1], sharex=True, constrained_layout=True
    )
    ax.plot([0, 1], [0, 1], color="#999999", linestyle="--", linewidth=1, label="Perfect")
    styles = {"model": ("Model", "#1f6feb", "o"), "market_avg": ("Market", "#d97706", "s")}
    for key, (label, color, marker) in styles.items():
        bins = [b for b in metrics["calibration"][key] if b["count"]]
        ax.plot(
            [b["mean_predicted"] for b in bins],
            [b["observed"] for b in bins],
            marker=marker,
            color=color,
            label=label,
        )
    ax.set_ylabel("Observed frequency")
    ax.set_title(f"Calibration, {', '.join(metrics['test_seasons'])}")
    ax.legend()
    ax.grid(alpha=0.3)
    model_bins = metrics["calibration"]["model"]
    hist.bar(
        [(b["lower"] + b["upper"]) / 2 for b in model_bins],
        [b["count"] for b in model_bins],
        width=0.09,
        color="#1f6feb",
        alpha=0.6,
    )
    hist.set_xlabel("Predicted probability (all 1X2 outcomes pooled)")
    hist.set_ylabel("Count")
    hist.set_xlim(0, 1)
    fig.savefig(path, dpi=120)
    plt.close(fig)


def plot_bankroll(sims: dict[str, BankrollResult], metrics: dict[str, Any], path: Path) -> None:
    fig, ax = plt.subplots(figsize=(8, 4.5), constrained_layout=True)
    start = metrics["config"]["start_cents"] / 100
    for name, sim in sims.items():
        if sim.curve.empty:
            continue
        ax.plot(sim.curve["date"], sim.curve["bankroll_cents"] / 100, label=SIM_LABELS[name])
    ax.axhline(start, color="#999999", linestyle="--", linewidth=1)
    ax.set_ylabel("Bankroll ($)")
    ax.set_title("Simulated bankroll (quarter Kelly, 5% per-bet cap, 15% daily cap)")
    ax.legend()
    ax.grid(alpha=0.3)
    fig.savefig(path, dpi=120)
    plt.close(fig)


def _f(v: Any, digits: int = 4) -> str:
    return "n/a" if v is None else f"{v:.{digits}f}"


def _pct(v: Any) -> str:
    return "n/a" if v is None else f"{100 * v:+.1f}%"


CANDIDATE_LABELS = {
    "blend": "Dixon-Coles + Elo blend",
    "stack": "Blend + shots on target, logistic stacker",
    "boosted": "Gradient boosting, Platt-calibrated",
    "market_avg": "Market, de-vigged average odds",
}


def _comparison(m: dict[str, Any]) -> list[str]:
    """The Part 18 side-by-side: candidates on the validation and the test seasons."""
    c = m["candidates"]
    versions = c["versions"]
    lines = [
        "## Model comparison",
        "",
        "Second-stage candidates read the blend's out-of-sample probabilities plus each team's "
        "shots on target for and against (exponentially weighted, decay "
        f"{m['config']['stage_two']['shot_decay']}, pre-match only). Both are refitted every "
        "month on earlier walk-forward rows. The candidate with the lower validation log loss "
        "is chosen; it replaces the blend only if its test log loss is lower too.",
        "",
        "| Forecast | Version | Validation log loss | Test log loss | Test Brier "
        "| Flat-stake ROI (95% CI) |",
        "|---|---|---|---|---|---|",
    ]
    for key, label in CANDIDATE_LABELS.items():
        flat = c["flat_stake_pre_match_avg"].get(key)
        roi = "n/a"
        if flat and flat["bets"]:
            lo, hi = flat["roi_ci95"]
            roi = f"{_pct(flat['roi'])} ({_pct(lo)} to {_pct(hi)}), {flat['bets']} bets"
        lines.append(
            f"| {label} | {versions.get(key, 'n/a')} | {_f(c['validation'][key]['log_loss'])} | "
            f"{_f(c['test'][key]['log_loss'])} | {_f(c['test'][key]['brier'])} | {roi} |"
        )
    chosen = CANDIDATE_LABELS[c["chosen"]].lower()
    delta = c["test"][c["chosen"]]["log_loss"] - c["test"]["blend"]["log_loss"]
    if c["shipped"]:
        outcome = (
            f"Chosen on validation: {chosen}. Its test log loss is {abs(delta):.4f} lower than "
            f"the blend's, so it ships as `{m['model_version']}`."
        )
    else:
        outcome = (
            f"Chosen on validation: {chosen}. Its test log loss is not lower than the blend's "
            f"({delta:+.4f}), so `{m['model_version']}` stays."
        )
    lines += [
        "",
        outcome,
        "",
        "Not included: the availability adjustment (a rating penalty per missing key player). "
        "No historical injury data exists for the backtest and the live injury feed does not "
        "say who is a key player, so it could not be tested and is left out.",
        "",
    ]
    return lines


def render_report(m: dict[str, Any]) -> str:
    s = m["scores"]
    lines = [
        "# Backtest report",
        "",
        f"Model `{m['model_version']}`. Test seasons: {', '.join(m['test_seasons'])}. "
        f"Validation seasons: {', '.join(m['validation_seasons'])}. "
        "Dixon-Coles / Elo blend weight chosen on the validation seasons only: "
        f"**{m['blend_weight_dc']:.2f} Dixon-Coles / {1 - m['blend_weight_dc']:.2f} Elo**.",
        "",
        "Walk-forward: models are refitted per league at the start of every month on matches "
        "dated before that month. Elo ratings are pre-match. Generated by "
        "`python -m betadvisor backtest`.",
        "",
        *_comparison(m),
        "## Forecast quality (lower is better)",
        "",
        f"All test matches with market odds (n = {s['market_avg']['n']}):",
        "",
        "| Forecast | Log loss | Brier |",
        "|---|---|---|",
    ]
    for key, label in (
        ("model", f"Model ({m['model_version']})"),
        ("blend", "Dixon-Coles + Elo blend"),
        ("elo", "Elo only"),
        ("market_avg", "Market, de-vigged average odds"),
    ):
        lines.append(f"| {label} | {_f(s[key]['log_loss'])} | {_f(s[key]['brier'])} |")
    if "dc_only_subset" in s:
        sub = s["dc_only_subset"]
        lines += [
            "",
            f"Matches where Dixon-Coles had both teams (n = {sub['model']['n']}):",
            "",
            "| Forecast | Log loss | Brier |",
            "|---|---|---|",
        ]
        for key, label in (
            ("dixon_coles", "Dixon-Coles only"),
            ("model", "Model"),
            ("market_avg", "Market, de-vigged average odds"),
        ):
            lines.append(f"| {label} | {_f(sub[key]['log_loss'])} | {_f(sub[key]['brier'])} |")
    if "pinnacle_close_subset" in s:
        sub = s["pinnacle_close_subset"]
        lines += [
            "",
            f"Matches with Pinnacle closing odds (n = {sub['model']['n']}):",
            "",
            "| Forecast | Log loss | Brier |",
            "|---|---|---|",
        ]
        for key, label in (
            ("model", "Model"),
            ("market_avg", "Market, de-vigged average odds"),
            ("pinnacle_close", "Pinnacle closing, de-vigged"),
        ):
            lines.append(f"| {label} | {_f(sub[key]['log_loss'])} | {_f(sub[key]['brier'])} |")

    lines += [
        "",
        "By league:",
        "",
        "| League | n | Model log loss | Market log loss |",
        "|---|---|---|---|",
    ]
    for league, v in m["scores_by_league"].items():
        lines.append(
            f"| {league} | {v['model']['n']} | {_f(v['model']['log_loss'])} | "
            f"{_f(v['market_avg']['log_loss'])} |"
        )

    gap = s["model"]["log_loss"] - s["market_avg"]["log_loss"]
    verdict = (
        "worse than the market" if gap > 0 else "better than the market" if gap < 0 else "level"
    )
    lines += [
        "",
        f"The model's log loss is {abs(gap):.4f} {verdict} "
        f"({'+' if gap > 0 else ''}{gap:.4f}). The bookmaker market is hard to beat; a small "
        "gap is the expected result for a public-data model.",
        "",
        "## Calibration",
        "",
        "![Calibration](calibration.png)",
        "",
        "| Bin | n | Model predicted | Observed | Market predicted | Market observed |",
        "|---|---|---|---|---|---|",
    ]
    for b, mk in zip(m["calibration"]["model"], m["calibration"]["market_avg"], strict=True):
        lines.append(
            f"| {b['lower']:.1f}-{b['upper']:.1f} | {b['count']} | {_f(b['mean_predicted'], 3)} | "
            f"{_f(b['observed'], 3)} | {_f(mk['mean_predicted'], 3)} | {_f(mk['observed'], 3)} |"
        )

    lines += [
        "",
        "## Simulated bankroll",
        "",
        "![Bankroll](bankroll.png)",
        "",
        "Real decision engine (min edge 4%, odds 1.40 to 6.00, quarter Kelly, 5% per-bet cap), "
        "plus the app rules: 15% daily exposure cap in descending edge order, $1 minimum "
        "stake. Start $100. Bets are settled the same day.",
        "",
        "| Odds used | Bets | Staked | Profit | ROI (95% CI) | Hit rate | Max drawdown "
        "| Final | Mean CLV |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for name, b in m["bankroll"].items():
        ci = b.get("roi_ci95")
        ci_text = f" ({_pct(ci[0])} to {_pct(ci[1])})" if ci else ""
        lines.append(
            f"| {name.replace('_', ' ')} | {b['bets']} | ${b['staked_cents'] / 100:,.2f} | "
            f"${b['profit_cents'] / 100:,.2f} | {_pct(b['roi'])}{ci_text} | "
            f"{_pct(b['hit_rate']).lstrip('+')} | {_pct(b['max_drawdown']).lstrip('+')} | "
            f"${b['final_cents'] / 100:,.2f} | {_pct(b.get('mean_clv'))} |"
        )
    mt = m["matches"]
    lines += [
        "",
        "The ROI interval is a bootstrap over bets (fixed seed "
        f"{m['seed']}). The closing-odds run is for comparison only: those prices are known "
        "just before kickoff, after the daily run. CLV compares the pre-match price taken with "
        "the market-average closing price (negative means the price moved against the bet). "
        "Stakes are a fraction of the current bankroll, so once it shrinks many stakes fall "
        "under the $1 minimum and are skipped.",
        "",
    ]
    flat = m["flat_stake_pre_match_avg"]
    if flat["bets"]:
        lo, hi = flat["roi_ci95"]
        lines += [
            "### Every signal at a flat stake",
            "",
            "Each recommended signal at 1 unit on pre-match average odds, with no bankroll, caps "
            f"or minimum stake: **{flat['bets']} bets, ROI {_pct(flat['roi'])} "
            f"(95% CI {_pct(lo)} to {_pct(hi)})**.",
            "",
            "| Season | Bets | ROI |",
            "|---|---|---|",
        ]
        for season, v in flat["by_season"].items():
            lines.append(f"| {season} | {v['bets']} | {_pct(v['roi'])} |")
        lines.append("")
        if hi < 0:
            lines += [
                "The whole interval is below zero: at this model version the signals lose money, "
                "and the chance that this is bad luck is small. The edges found against the "
                "market are mostly model error. Treat recommendations as paper bets only.",
                "",
            ]
    lines += [
        "## Coverage",
        "",
        f"- Test matches predicted: {mt['test_predicted']}; scored against the market: "
        f"{mt['scored_with_market']}.",
        f"- Matches with a side unknown to Dixon-Coles (promoted club, first month), "
        f"Elo used alone: {mt['dc_missing_elo_fallback']}.",
        f"- Validation matches used for the blend weight and the candidate choice: "
        f"{mt['validation_predicted']}.",
        f"- Second stage trained on walk-forward rows from "
        f"{', '.join(mt['stage2_training_seasons']) or 'no earlier season'} onward; test "
        f"matches without shot rates or a month without enough training rows, blend kept: "
        f"{mt['stage2_fallback']}.",
    ]
    for name, b in m["bankroll"].items():
        lines.append(
            f"- Bankroll {name.replace('_', ' ')}: skipped for the daily cap "
            f"{b['skipped_daily_cap']}, under the minimum stake {b['skipped_min_stake']}, "
            f"no odds {b['matches_without_odds']}."
        )
    lines.append("")
    return "\n".join(lines)
