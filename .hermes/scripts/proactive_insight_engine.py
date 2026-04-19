#!/usr/bin/env python3
"""
Proactive Insight Engine — Scheduled intelligence extraction from Hermes state.

Runs on a cron schedule and proactively surfaces actionable insights from
the Hermes session database without requiring a user to ask.

Key capabilities:
- Detects usage anomalies (cost spikes, token anomalies, session drops)
- Identifies productivity patterns (busy days, peak hours, tool efficiency)
- Tracks behavioral changes vs previous periods
- Generates proactive alerts and summary reports

Designed to run as a standalone cron job, outputting to stdout/Telegram.

Usage:
    python3 proactive_insight_engine.py [--days N] [--format gateway|terminal|json]
    python3 proactive_insight_engine.py --days 7 --format gateway
"""

import argparse
import json
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

# Add the hermes-agent to the path for imports
sys.path.insert(0, str(Path(__file__).parent))

from agent.insights import InsightsEngine
from hermes_state import SessionDB


# ── Anomaly Detection Thresholds ────────────────────────────────────────────

COST_SPIKE_THRESHOLD = 2.0       # 2x the daily average = cost spike
TOKEN_ANOMALY_THRESHOLD = 3.0    # 3x average = token anomaly
SESSION_DROP_THRESHOLD = 0.5      # 50% fewer sessions vs previous period
TOOL_CONCENTRATION_THRESHOLD = 0.8  # 80% of calls in one tool = over-reliance
IDLE_DAYS_THRESHOLD = 7           # Days with no sessions = idle warning


# ── Insight Types ─────────────────────────────────────────────────────────────

class ProactiveInsightEngine:
    """
    Proactive insight generation engine.

    Analyzes current period vs previous period to detect:
    - Cost anomalies
    - Usage pattern changes
    - Tool over-reliance
    - Idle/warning conditions
    - Productivity trends
    """

    def __init__(self, db: SessionDB):
        self.db = db
        self.insights = InsightsEngine(db)

    # ── Period Comparison ────────────────────────────────────────────────────

    def _get_previous_period(self, days: int) -> tuple[float, float]:
        """Get time bounds for the previous period of same length."""
        now = time.time()
        current_start = now - (days * 86400)
        previous_end = current_start
        previous_start = previous_end - (days * 86400)
        return previous_start, previous_end

    def _get_period_sessions(self, start: float, end: float) -> list:
        """Get sessions within a time window."""
        cursor = self.db._conn.execute(
            """SELECT id, source, model, started_at, ended_at,
                      message_count, tool_call_count, input_tokens, output_tokens,
                      cache_read_tokens, cache_write_tokens, estimated_cost_usd
               FROM sessions
               WHERE started_at >= ? AND started_at < ?
               ORDER BY started_at DESC""",
            (start, end)
        )
        return [dict(row) for row in cursor.fetchall()]

    def _sum_tokens(self, sessions: list) -> int:
        return sum(
            (s.get("input_tokens") or 0) + (s.get("output_tokens") or 0)
            for s in sessions
        )

    def _sum_cost(self, sessions: list) -> float:
        return sum(s.get("estimated_cost_usd") or 0.0 for s in sessions)

    def _count_sessions(self, sessions: list) -> int:
        return len(sessions)

    # ── Anomaly Detectors ──────────────────────────────────────────────────

    def detect_cost_spike(self, current_sessions: list, previous_sessions: list) -> dict | None:
        """Detect if current period has significantly higher cost than previous."""
        current_days = 7  # Approximate
        prev_cost = self._sum_cost(previous_sessions)
        curr_cost = self._sum_cost(current_sessions)

        if not previous_sessions or prev_cost == 0:
            return None

        prev_daily = prev_cost / max(len(previous_sessions), 1) * 7 / len(previous_sessions) if previous_sessions else 0
        curr_daily = curr_cost / max(len(current_sessions), 1) * 7 / len(current_sessions) if current_sessions else 0

        # Simple daily average comparison
        prev_days_approx = len(previous_sessions) / max(1, len(previous_sessions)) * 7
        if prev_days_approx == 0:
            return None

        ratio = curr_cost / max(prev_cost, 0.01)

        if ratio >= COST_SPIKE_THRESHOLD:
            return {
                "type": "cost_spike",
                "severity": "high" if ratio >= 3.0 else "medium",
                "current_cost": round(curr_cost, 4),
                "previous_cost": round(prev_cost, 4),
                "ratio": round(ratio, 2),
                "message": (
                    f"Cost spike detected: ${curr_cost:.2f} this period "
                    f"vs ${prev_cost:.2f} previous period ({ratio:.1f}x)"
                )
            }
        return None

    def detect_session_drop(self, current_sessions: list, previous_sessions: list) -> dict | None:
        """Detect significant drop in session count vs previous period."""
        if not previous_sessions:
            return None

        ratio = len(current_sessions) / max(len(previous_sessions), 1)

        if ratio <= SESSION_DROP_THRESHOLD:
            return {
                "type": "session_drop",
                "severity": "high" if ratio <= 0.25 else "medium",
                "current_sessions": len(current_sessions),
                "previous_sessions": len(previous_sessions),
                "ratio": round(ratio, 2),
                "message": (
                    f"Session drop detected: {len(current_sessions)} sessions this period "
                    f"vs {len(previous_sessions)} previously ({ratio:.0%})"
                )
            }
        return None

    def detect_token_anomaly(self, current_sessions: list, previous_sessions: list) -> dict | None:
        """Detect unusually high token usage per session."""
        if not current_sessions or not previous_sessions:
            return None

        curr_tokens = self._sum_tokens(current_sessions)
        prev_tokens = self._sum_tokens(previous_sessions)

        if prev_tokens == 0:
            return None

        curr_avg = curr_tokens / len(current_sessions)
        prev_avg = prev_tokens / len(previous_sessions)

        ratio = curr_avg / max(prev_avg, 1)

        if ratio >= TOKEN_ANOMALY_THRESHOLD:
            return {
                "type": "token_anomaly",
                "severity": "medium",
                "current_avg_tokens": round(curr_avg),
                "previous_avg_tokens": round(prev_avg),
                "ratio": round(ratio, 2),
                "message": (
                    f"Token anomaly: {curr_avg:,.0f} avg tokens/session "
                    f"vs {prev_avg:,.0f} previously ({ratio:.1f}x)"
                )
            }
        return None

    def detect_tool_overreliance(self, sessions: list, days: int) -> dict | None:
        """Detect if one tool dominates usage (>80% of calls)."""
        if not sessions:
            return None

        cutoff = time.time() - (days * 86400)
        recent_sessions = [s for s in sessions if s.get("started_at", 0) >= cutoff]

        total_tool_calls = sum(s.get("tool_call_count") or 0 for s in recent_sessions)

        if total_tool_calls == 0:
            return None

        # Get tool breakdown from insights engine
        tool_usage = self.insights._get_tool_usage(cutoff)

        if not tool_usage:
            return None

        top_tool = tool_usage[0]
        concentration = top_tool["count"] / max(total_tool_calls, 1)

        if concentration >= TOOL_CONCENTRATION_THRESHOLD:
            return {
                "type": "tool_overreliance",
                "severity": "low",
                "top_tool": top_tool["tool_name"],
                "concentration": round(concentration * 100, 1),
                "total_calls": total_tool_calls,
                "message": (
                    f"Tool over-reliance: {top_tool['tool_name']} "
                    f"used for {concentration*100:.0f}% of calls "
                    f"({top_tool['count']:,} of {total_tool_calls:,} total)"
                )
            }
        return None

    def detect_idle_days(self, sessions: list, days: int) -> dict | None:
        """Detect days with no sessions in the period."""
        if not sessions:
            return {
                "type": "idle",
                "severity": "high",
                "idle_days": days,
                "message": f"No sessions recorded in the last {days} days — system may be idle"
            }

        # Build set of days with sessions
        session_days = set()
        for s in sessions:
            if s.get("started_at"):
                dt = datetime.fromtimestamp(s["started_at"])
                session_days.add(dt.strftime("%Y-%m-%d"))

        idle_days = days - len(session_days)

        if idle_days >= IDLE_DAYS_THRESHOLD:
            return {
                "type": "idle",
                "severity": "medium" if idle_days < days else "high",
                "active_days": len(session_days),
                "idle_days": idle_days,
                "message": (
                    f"Idle detected: {idle_days} of {days} days had no sessions. "
                    f"Active: {', '.join(sorted(session_days)[-5:])}"
                )
            }
        return None

    def detect_productivity_trend(self, current_sessions: list, previous_sessions: list) -> dict | None:
        """Detect positive or negative productivity trends."""
        if not current_sessions or not previous_sessions:
            return None

        curr_tools = sum(s.get("tool_call_count") or 0 for s in current_sessions)
        prev_tools = sum(s.get("tool_call_count") or 0 for s in previous_sessions)

        if prev_tools == 0:
            return None

        tool_ratio = curr_tools / prev_tools
        session_ratio = len(current_sessions) / len(previous_sessions)

        # More sessions + more tool calls = positive trend
        if tool_ratio >= 1.2 and session_ratio >= 0.8:
            return {
                "type": "productivity_up",
                "severity": "info",
                "tool_change_pct": round((tool_ratio - 1) * 100),
                "session_change_pct": round((session_ratio - 1) * 100),
                "message": (
                    f"Productivity up: {tool_ratio:.0%} tool calls vs previous period "
                    f"({(tool_ratio-1)*100:+.0f}%)"
                )
            }

        # Fewer sessions + fewer tools = declining
        if tool_ratio <= 0.7 and session_ratio <= 0.9:
            return {
                "type": "productivity_down",
                "severity": "medium",
                "tool_change_pct": round((tool_ratio - 1) * 100),
                "session_change_pct": round((session_ratio - 1) * 100),
                "message": (
                    f"Productivity down: {tool_ratio:.0%} tool calls vs previous period "
                    f"({(tool_ratio-1)*100:.0f}%)"
                )
            }

        return None

    # ── Main Analysis ───────────────────────────────────────────────────────

    def analyze(self, days: int = 7) -> dict:
        """
        Run full proactive analysis for the given period.

        Args:
            days: Number of days to analyze (default: 7)

        Returns:
            Dict with insights, alerts, and summary stats
        """
        cutoff = time.time() - (days * 86400)
        prev_start, prev_end = self._get_previous_period(days)

        # Get current and previous period sessions
        current_sessions = self._get_period_sessions(cutoff, time.time())
        previous_sessions = self._get_period_sessions(prev_start, prev_end)

        # Get full insights report
        insights_report = self.insights.generate(days=days)

        # Run anomaly detectors
        alerts = []
        insights = []

        # Cost spike
        cost_alert = self.detect_cost_spike(current_sessions, previous_sessions)
        if cost_alert:
            alerts.append(cost_alert)

        # Session drop
        session_alert = self.detect_session_drop(current_sessions, previous_sessions)
        if session_alert:
            alerts.append(session_alert)

        # Token anomaly
        token_alert = self.detect_token_anomaly(current_sessions, previous_sessions)
        if token_alert:
            alerts.append(token_alert)

        # Tool over-reliance
        tool_alert = self.detect_tool_overreliance(current_sessions, days)
        if tool_alert:
            insights.append(tool_alert)

        # Idle days
        idle_alert = self.detect_idle_days(current_sessions, days)
        if idle_alert:
            alerts.append(idle_alert)

        # Productivity trend
        trend = self.detect_productivity_trend(current_sessions, previous_sessions)
        if trend:
            insights.append(trend)

        # High severity alerts come first
        alerts.sort(key=lambda x: {"high": 0, "medium": 1, "low": 2}.get(x.get("severity", "low"), 3))

        return {
            "period_days": days,
            "generated_at": time.time(),
            "generated_at_str": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "current_period": {
                "sessions": len(current_sessions),
                "tokens": self._sum_tokens(current_sessions),
                "cost": self._sum_cost(current_sessions),
            },
            "previous_period": {
                "sessions": len(previous_sessions),
                "tokens": self._sum_tokens(previous_sessions),
                "cost": self._sum_cost(previous_sessions),
            },
            "insights_report": insights_report,
            "alerts": alerts,
            "insights": insights,
            "status": "alert" if alerts else "ok",
        }

    # ── Formatting ─────────────────────────────────────────────────────────

    def format_gateway(self, analysis: dict) -> str:
        """Format for Telegram/messaging delivery."""
        lines = []

        if analysis["status"] == "ok" and not analysis["insights"]:
            return None  # No news is good news — don't send

        lines.append("📡 **Proactive Insight Engine**\n")

        # Status
        if analysis["alerts"]:
            lines.append(f"🔴 **Alerts:** {len(analysis['alerts'])}")
            for alert in analysis["alerts"]:
                severity_emoji = {"high": "🔴", "medium": "🟡", "low": "🟢"}.get(alert.get("severity"), "⚪")
                lines.append(f"{severity_emoji} {alert['message']}")
            lines.append("")

        if analysis["insights"]:
            lines.append(f"💡 **Insights:** {len(analysis['insights'])}")
            for insight in analysis["insights"]:
                lines.append(f"  • {insight['message']}")
            lines.append("")

        # Summary stats
        curr = analysis["current_period"]
        prev = analysis["previous_period"]

        if prev["sessions"] > 0:
            session_change = curr["sessions"] / prev["sessions"]
            change_str = f"({session_change:+.0%})" if session_change != 1 else ""
            lines.append(f"📊 Sessions: {curr['sessions']} vs {prev['sessions']} prev {change_str}")

        if curr["cost"] > 0:
            lines.append(f"💰 Est. cost: ${curr['cost']:.2f}")

        if curr["tokens"] > 0:
            lines.append(f"🔤 Tokens: {curr['tokens']:,}")

        return "\n".join(lines)

    def format_terminal(self, analysis: dict) -> str:
        """Format for terminal display."""
        lines = []
        lines.append("")
        lines.append("  ╔══════════════════════════════════════════════════════════╗")
        lines.append("  ║           📡 Proactive Insight Engine Report             ║")
        lines.append("  ╚══════════════════════════════════════════════════════════╝")
        lines.append(f"  Period: Last {analysis['period_days']} days | Generated: {analysis['generated_at_str']}")
        lines.append("")

        # Alerts
        if analysis["alerts"]:
            lines.append("  🔴 ALERTS")
            lines.append("  " + "─" * 56)
            for alert in analysis["alerts"]:
                severity_marker = {"high": "[!!]", "medium": "[!]", "low": "[~]"}.get(alert.get("severity"), "[ ]")
                lines.append(f"  {severity_marker} {alert['message']}")
            lines.append("")
        else:
            lines.append("  🟢 No alerts")
            lines.append("")

        # Insights
        if analysis["insights"]:
            lines.append("  💡 INSIGHTS")
            lines.append("  " + "─" * 56)
            for insight in analysis["insights"]:
                lines.append(f"  • {insight['message']}")
            lines.append("")

        # Period comparison
        curr = analysis["current_period"]
        prev = analysis["previous_period"]
        lines.append("  📊 PERIOD COMPARISON")
        lines.append("  " + "─" * 56)
        lines.append(f"  {'Metric':<20} {'Current':>12} {'Previous':>12}")
        lines.append(f"  {'Sessions':<20} {curr['sessions']:>12} {prev['sessions']:>12}")
        lines.append(f"  {'Tokens':<20} {curr['tokens']:>12,} {prev['tokens']:>12,}")
        lines.append(f"  {'Est. Cost':<20} ${curr['cost']:>11.2f} ${prev['cost']:>11.2f}")
        lines.append("")

        return "\n".join(lines)


# ── CLI Entry Point ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Proactive Insight Engine")
    parser.add_argument(
        "--days", type=int, default=7,
        help="Number of days to analyze (default: 7)"
    )
    parser.add_argument(
        "--format", choices=["gateway", "terminal", "json"], default="terminal",
        help="Output format (default: terminal)"
    )
    parser.add_argument(
        "--db-path",
        help="Path to state.db (default: ~/.hermes/state.db)"
    )
    args = parser.parse_args()

    # Initialize database
    if args.db_path:
        db = SessionDB(db_path=Path(args.db_path))
    else:
        db = SessionDB()

    try:
        engine = ProactiveInsightEngine(db)
        analysis = engine.analyze(days=args.days)

        if args.format == "json":
            print(json.dumps(analysis, indent=2, default=str))
        elif args.format == "terminal":
            print(engine.format_terminal(analysis))
        else:  # gateway
            result = engine.format_gateway(analysis)
            if result:
                print(result)
            else:
                print("Proactive Insight: No anomalies detected. System operating normally.")

    finally:
        db.close()


if __name__ == "__main__":
    main()
