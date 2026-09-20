"""Stateless simulation service. Express owns users and storage; this only computes."""
import hmac
import os

from flask import Flask, jsonify, request

from backtest import run_backtest
from categorize import STANDARD_CATEGORIES
from errors import SimError
from parsing import parse_statement
from simulate import run_simulation

MAX_UPLOAD_BYTES = 2 * 1024 * 1024


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES

    @app.before_request
    def require_key():
        # The service is publicly reachable when deployed; only our API should call it.
        key = os.environ.get("SIM_API_KEY")
        if not key or request.path == "/health":
            return None
        if not hmac.compare_digest(request.headers.get("X-Sim-Key", ""), key):
            return jsonify(error="unauthorized"), 401
        return None

    @app.get("/health")
    def health():
        return jsonify(status="ok")

    @app.get("/categories")
    def categories():
        return jsonify(categories=STANDARD_CATEGORIES)

    @app.post("/parse")
    def parse():
        f = request.files.get("file")
        if f is None:
            return jsonify(error="Attach a CSV as multipart field 'file'"), 400
        return jsonify(parse_statement(f.read()))

    @app.post("/simulate")
    def simulate():
        return jsonify(run_simulation(request.get_json(force=True, silent=True) or {}))

    @app.post("/backtest")
    def backtest():
        return jsonify(run_backtest(request.get_json(force=True, silent=True) or {}))

    @app.errorhandler(SimError)
    def sim_error(e):
        return jsonify(error=str(e)), 422

    @app.errorhandler(413)
    def too_large(e):
        return jsonify(error="File too large (max 2 MB)"), 413

    @app.errorhandler(Exception)
    def unexpected(e):
        if hasattr(e, "code") and isinstance(e.code, int):  # werkzeug HTTPException
            return jsonify(error=getattr(e, "description", "error")), e.code
        app.logger.exception("unhandled error")
        return jsonify(error="Internal error"), 500

    return app


app = create_app()
