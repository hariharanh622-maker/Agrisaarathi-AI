
import os
import sqlite3
import json
import math
from contextlib import closing
from datetime import date

from flask import Flask, render_template, request, jsonify


PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
from engine import AgriEngine


DATA_DIR = os.path.join(PROJECT_DIR, "data")
CSV_PATH = os.path.join(DATA_DIR, "soil_telemetry_sample.csv")
DB_PATH = os.path.join(DATA_DIR, "agri_history.db")

os.makedirs(DATA_DIR, exist_ok=True)

app = Flask(__name__)
engine = AgriEngine(DATA_DIR)


def get_db():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def create_table():
    with closing(get_db()) as connection:
        with connection:
            connection.execute("""
                CREATE TABLE IF NOT EXISTS analysis_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT,
                    crop TEXT,
                    moisture REAL,
                    temperature REAL,
                    ph REAL,
                    result TEXT
                )
            """)


create_table()


@app.route("/")
def home():
    return render_template("index.html", today=date.today())


@app.route("/api/health")
def health():
    return jsonify({
        "status": "running",
        "application": "AgriSaarthi AI"
    })


@app.route("/api/analyze", methods=["POST"])
def analyze():
    try:
        values = request.get_json(silent=True) or {}
        if not isinstance(values, dict):
            return jsonify({"error": "Please submit soil readings as an object."}), 400

        required = [
            "moisture", "temperature", "humidity",
            "N", "P", "K", "ph", "rainfall"
        ]

        for key in required:
            if key not in values or values[key] == "":
                return jsonify({
                    "error": f"Please enter {key}."
                }), 400

        for key in required:
            values[key] = float(values[key])
            if not math.isfinite(values[key]):
                return jsonify({"error": f"{key} must be a finite number."}), 400

        if not all(
            0 <= values[key] <= 100
            for key in ["moisture", "humidity"]
        ):
            return jsonify({
                "error": "Moisture and humidity must be between 0 and 100."
            }), 400

        if not 0 <= values["ph"] <= 14:
            return jsonify({"error": "pH must be between 0 and 14."}), 400

        if any(values[key] < 0 for key in ["N", "P", "K", "rainfall"]):
            return jsonify({
                "error": "NPK and rainfall cannot be negative."
            }), 400

        telemetry = None

        if os.path.exists(CSV_PATH):
            try:
                telemetry = engine.analyze_telemetry(CSV_PATH)
            except (OSError, ValueError) as error:
                app.logger.warning("Telemetry unavailable during analysis: %s", error)

        result = engine.run_agent(values, telemetry)

        with closing(get_db()) as connection:
            with connection:
                connection.execute("""
                    INSERT INTO analysis_history
                    (created_at, crop, moisture, temperature, ph, result)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    result["created_at"],
                    result["crop"]["crop"],
                    values["moisture"],
                    values["temperature"],
                    values["ph"],
                    json.dumps(result)
                ))

        return jsonify(result)

    except (ValueError, TypeError):
        return jsonify({
            "error": "Please enter valid numeric values."
        }), 400

    except Exception as error:
        app.logger.exception("Analysis failed")
        return jsonify({
            "error": "Analysis failed. Please check your input."
        }), 500


@app.route("/api/telemetry")
def telemetry():
    try:
        result = engine.analyze_telemetry(CSV_PATH)
        return jsonify(result)
    except (OSError, ValueError) as error:
        app.logger.warning("Telemetry unavailable: %s", error)
        return jsonify({"error": "Telemetry data is unavailable."}), 503


@app.route("/api/history")
def history():
    with closing(get_db()) as connection:
        rows = connection.execute("""
            SELECT id, created_at, crop, moisture, temperature, ph
            FROM analysis_history
            ORDER BY id DESC
            LIMIT 20
        """).fetchall()

    return jsonify([dict(row) for row in rows])


if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1")
