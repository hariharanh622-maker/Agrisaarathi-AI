import argparse
import csv
import math
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parent
FEATURES = ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"]
TARGET = "label"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train the AgriSaarthi crop recommendation model."
    )
    parser.add_argument(
        "--dataset",
        type=Path,
        default=PROJECT_DIR / "data" / "crop_recommendation.csv",
        help="CSV with N, P, K, temperature, humidity, ph, rainfall, and label columns.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=PROJECT_DIR / "data" / "crop_model.pkl",
        help="Output path used by the Flask crop recommendation engine.",
    )
    args = parser.parse_args()

    required_columns = FEATURES + [TARGET]
    with args.dataset.open(newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(line for line in file if line.strip())
        missing_columns = sorted(
            set(required_columns) - set(reader.fieldnames or [])
        )
        if missing_columns:
            raise ValueError(
                "Dataset is missing required columns: "
                + ", ".join(missing_columns)
            )

        feature_data = []
        labels = []
        for line_number, row in enumerate(reader, start=2):
            try:
                features = [float(row[name]) for name in FEATURES]
            except (TypeError, ValueError) as error:
                raise ValueError(
                    f"Invalid crop feature value on CSV row {line_number}."
                ) from error
            if not all(math.isfinite(value) for value in features):
                raise ValueError(
                    f"Crop feature values must be finite numbers (CSV row {line_number})."
                )

            label = (row[TARGET] or "").strip()
            if not label:
                raise ValueError(f"Missing crop label on CSV row {line_number}.")
            feature_data.append(features)
            labels.append(label)

    if not feature_data:
        raise ValueError("The crop recommendation dataset is empty.")
    if len(set(labels)) < 2:
        raise ValueError("The label column must contain at least two crop classes.")

    import joblib
    from sklearn.ensemble import RandomForestClassifier

    model = RandomForestClassifier(
        n_estimators=300,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(feature_data, labels)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, args.output)
    print(
        f"Trained on {len(feature_data)} records across {len(set(labels))} crop classes. "
        f"Model saved to {args.output}."
    )


if __name__ == "__main__":
    main()
