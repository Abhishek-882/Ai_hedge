"""Funding Rate Arbitrage Swarm — Main Bot CLI and Runtime Entrypoint.
Provides a strategy-agnostic command-line interface for running single or multi-strategy
funding rate arbitrage bots on testnet/paper environments.
"""

from __future__ import annotations

import argparse
import logging
import os
from pathlib import Path
import sys
import time
from typing import Any

# Ensure project root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.core.exceptions import (
    LiveTradingForbiddenException,
    MainnetEndpointDetectedException,
)
from src.engine.runner import STRATEGY_REGISTRY, BotRunner
from src.storage.database import DatabaseManager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("BotCLI")


def build_parser() -> argparse.ArgumentParser:
    """Constructs command line argument parser."""
    parser = argparse.ArgumentParser(
        description="Funding Rate Arbitrage Swarm Bot Runner & Strategy Dispatcher",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python src/bot.py --strategy idea_03_cross_exchange --venues binance,bybit --symbol BTCUSDT
  python src/bot.py --strategy all --venues binance,bybit,delta_india --duration 60
  python src/bot.py --status
  python src/bot.py --list-strategies
        """,
    )

    parser.add_argument(
        "--strategy",
        "-s",
        type=str,
        default="idea_03_cross_exchange",
        help="Strategy ID or name to run, or 'all' to run all 5 strategies concurrently (default: idea_03_cross_exchange)",
    )
    parser.add_argument(
        "--venues",
        "-v",
        type=str,
        default="binance,bybit,bitget,delta_india",
        help="Comma-separated list of exchange venues (e.g. binance,bybit,bitget,delta_india,paper)",
    )
    parser.add_argument(
        "--symbol",
        type=str,
        default="BTCUSDT",
        help="Trading pair symbol (default: BTCUSDT)",
    )
    parser.add_argument(
        "--notional",
        type=float,
        default=2000.0,
        help="Target position notional in USD per trade (default: 2000.0)",
    )
    parser.add_argument(
        "--db",
        type=str,
        default="funding_rate_swarm.db",
        help="Path to SQLite state persistence database (default: funding_rate_swarm.db)",
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=None,
        help="Run duration in seconds (default: runs indefinitely until interrupted, or single step if not specified)",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=1.0,
        help="Seconds between market polling iterations (default: 1.0)",
    )
    parser.add_argument(
        "--iterations",
        type=int,
        default=None,
        help="Number of discrete iterations to execute before exiting (default: None)",
    )
    parser.add_argument(
        "--arm-live",
        action="store_true",
        default=False,
        help="[RESTRICTED] Arm live trading execution switch. Requires Human Overseer custody. Throws LiveTradingForbiddenException.",
    )
    parser.add_argument(
        "--status",
        action="store_true",
        default=False,
        help="Display current system, strategy, and risk status and exit.",
    )
    parser.add_argument(
        "--list-strategies",
        action="store_true",
        default=False,
        help="List all registered quantitative strategies and exit.",
    )
    parser.add_argument(
        "--unlock-kill-switch",
        type=str,
        default=None,
        help="Unlock a tripped kill-switch using an authorization token.",
    )

    return parser


def main() -> int:
    """Main CLI entrypoint."""
    parser = build_parser()
    args = parser.parse_args()

    print("=" * 80)
    print("FUNDING RATE ARBITRAGE SWARM — BOT EXECUTION ENGINE")
    print("=" * 80)

    # 1. Handle --list-strategies
    if args.list_strategies:
        print("\nRegistered Quantitative Strategies:")
        for name in sorted(STRATEGY_REGISTRY.keys()):
            cls = STRATEGY_REGISTRY[name]
            print(f"  - {name:<30} -> {cls.__name__}")
        print()
        return 0

    # 2. Initialize Database & BotRunner
    db = DatabaseManager(db_path=args.db)

    # 3. Handle --unlock-kill-switch
    if args.unlock_kill_switch:
        from src.engine.kill_switch import KillSwitch
        ks = KillSwitch(db_manager=db)
        success = ks.unlock_switch(token=args.unlock_kill_switch, authorized_by="OVERSEER_CLI")
        if success:
            print(f"\nKill-switch unlocked successfully. State: UNLOCKED\n")
            return 0
        else:
            print(f"\nFailed to unlock kill-switch with provided token.\n")
            return 1

    # 4. Handle --arm-live (Strict Human-Only Live Switch Guardrail)
    if args.arm_live:
        logger.critical("ATTEMPTED LIVE TRADING ACTIVATION: Arm for live trading switch requested.")
        raise LiveTradingForbiddenException(
            "CRITICAL SECURITY GUARDRAIL: Live trading switch is engaged or requested. "
            "Swarm execution is strictly restricted to Testnet and Paper simulation."
        )

    # 5. Initialize BotRunner
    runner = BotRunner(
        db_manager=db,
        db_path=args.db,
        is_live_armed=args.arm_live,
        symbol=args.symbol,
        notional_usd=args.notional,
    )

    # 6. Setup Connectors
    venue_list = [v.strip() for v in args.venues.split(",") if v.strip()]
    runner.setup_connectors(venues=venue_list)

    # 7. Load Strategy / Strategies
    if args.strategy.lower() == "all":
        loaded = runner.load_all_strategies()
        print(f"Loaded all {len(loaded)} strategies into execution engine.")
    else:
        loaded_strat = runner.load_strategy(args.strategy)
        print(f"Loaded strategy: {loaded_strat.strategy_id} ({loaded_strat.__class__.__name__})")

    # 8. Handle --status
    if args.status:
        status = runner.get_status_summary()
        print("\nSystem Status Summary:")
        for k, v in status.items():
            print(f"  {k:<28}: {v}")
        print()
        return 0

    # 9. Execute Run Loop
    print(f"\nRunning bot on symbol {args.symbol} across venues {venue_list}...")
    if args.iterations:
        print(f"Executing {args.iterations} discrete iterations:")
        for i in range(args.iterations):
            res = runner.run_iteration()
            print(f"  [Iter {res['iteration']}] Equity=${res['total_equity']:.2f} | Orders={res['executed_orders_count']} | Unwinds={res['unwinds_count']}")
            if i + 1 < args.iterations:
                time.sleep(args.poll_interval)
    else:
        runner.run_continuous(
            duration_seconds=args.duration,
            poll_interval_seconds=args.poll_interval,
        )

    print("\nBot execution completed successfully.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
