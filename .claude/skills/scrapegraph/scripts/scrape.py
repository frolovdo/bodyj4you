#!/usr/bin/env python3
"""Thin CLI over the scrapegraphai library.

Runs one of the library's graph pipelines and prints the result as JSON on
stdout, so the calling agent never has to write throwaway Python.

Examples:
    scrape.py smart  --prompt "List every product and its price" --source https://example.com
    scrape.py multi  --prompt "Extract the title"  --source https://a.com https://b.com
    scrape.py search --prompt "Which piercing aftercare sprays rank on Amazon?" --max-results 5
"""

import argparse
import json
import os
import sys


def build_config(args):
    """Assemble the graph_config dict the library expects."""
    model = args.model or os.environ.get("SCRAPEGRAPH_MODEL")

    if model is None:
        if os.environ.get("OPENAI_API_KEY"):
            model = "openai/gpt-4o-mini"
        else:
            model = "ollama/llama3.2"

    llm = {"model": model}

    provider = model.split("/", 1)[0]
    env_key = {
        "openai": "OPENAI_API_KEY",
        "azure_openai": "AZURE_OPENAI_API_KEY",
        "google_genai": "GOOGLE_API_KEY",
        "google_vertexai": "GOOGLE_API_KEY",
        "groq": "GROQ_API_KEY",
        "mistralai": "MISTRAL_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
    }.get(provider)

    if env_key:
        api_key = os.environ.get(env_key)
        if not api_key:
            sys.exit(
                f"error: model '{model}' needs {env_key} in the environment. "
                "Export it, pick another --model, or run a local model via 'ollama/<name>'."
            )
        llm["api_key"] = api_key
    elif provider == "ollama":
        # Local models have no key but do want an explicit context window.
        llm["model_tokens"] = args.model_tokens
        llm["format"] = "json"

    return {
        "llm": llm,
        "verbose": args.verbose,
        "headless": True,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("pipeline", choices=["smart", "multi", "search"])
    parser.add_argument("--prompt", required=True, help="What to extract, in plain English.")
    parser.add_argument(
        "--source",
        nargs="+",
        default=[],
        help="URL or local file for 'smart'; one or more URLs for 'multi'. Unused by 'search'.",
    )
    parser.add_argument("--model", help="Provider-prefixed model, e.g. openai/gpt-4o-mini or ollama/llama3.2.")
    parser.add_argument("--model-tokens", type=int, default=8192, help="Context window for local (ollama) models.")
    parser.add_argument("--max-results", type=int, default=3, help="Search results to scrape, 'search' only.")
    parser.add_argument("--output", help="Write the JSON result here instead of stdout.")
    parser.add_argument("--verbose", action="store_true", help="Let the library log its pipeline to stderr.")
    args = parser.parse_args()

    if args.pipeline in ("smart", "multi") and not args.source:
        parser.error(f"--source is required for the '{args.pipeline}' pipeline")

    try:
        from scrapegraphai.graphs import SearchGraph, SmartScraperGraph, SmartScraperMultiGraph
    except ImportError:
        sys.exit(
            "error: scrapegraphai is not installed in this interpreter.\n"
            "  python3.12 -m venv ~/.venvs/scrapegraph\n"
            '  ~/.venvs/scrapegraph/bin/pip install "scrapegraphai @ git+https://github.com/ScrapeGraphAI/Scrapegraph-ai"\n'
            "  ~/.venvs/scrapegraph/bin/playwright install chromium\n"
            "(the current PyPI release has a broken langchain-community import; install from git)"
        )

    config = build_config(args)

    if args.pipeline == "smart":
        graph = SmartScraperGraph(prompt=args.prompt, source=args.source[0], config=config)
    elif args.pipeline == "multi":
        graph = SmartScraperMultiGraph(prompt=args.prompt, source=args.source, config=config)
    else:
        config["max_results"] = args.max_results
        graph = SearchGraph(prompt=args.prompt, config=config)

    result = graph.run()
    payload = json.dumps(result, indent=2, default=str)

    if args.output:
        with open(args.output, "w") as handle:
            handle.write(payload + "\n")
        print(f"wrote {args.output}")
    else:
        print(payload)


if __name__ == "__main__":
    main()
