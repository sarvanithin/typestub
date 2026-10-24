"""API prices, shared by the harness spend cap and the report's cost-weighted metrics."""

# USD per million tokens (input, output); cache reads bill at 0.1x input, cache writes at 1.25x.
PRICES = {"claude-opus-5-5": (4.0, 20.0), "claude-haiku-5-5": (0.10, 0.50)}


def episode_cost(model: str, usage: dict) -> float:
    inp, out = PRICES.get(model, (4.0, 20.0))
    return (usage.get("input", 0) * inp + usage.get("output", 0) * out
            + usage.get("cache_read", 0) * inp * 0.1 + usage.get("cache_write", 0) * inp * 1.25) / 1e6
