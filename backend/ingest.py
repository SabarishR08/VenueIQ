import time
from dataclasses import dataclass, asdict
from typing import Dict, List
import logging

LIVE_COUNTS: Dict[str, Dict[str, object]] = {}
KNOWN_ZONES = {
    "Gate A",
    "Gate B",
    "Gate C",
    "Gate D",
    "Food Court",
    "Exit",
    "Seating",
    "Gate North",
    "Gate South",
    "Gate East",
    "Gate West",
    "Concession",
}

logger = logging.getLogger(__name__)


@dataclass
class IngestPayload:
    zone: str
    count: int
    source: str
    timestamp: float = None

    def __post_init__(self) -> None:
        if self.timestamp is None:
            self.timestamp = time.time()


def apply_overrides(zone_counts: Dict[str, int]) -> Dict[str, int]:
    merged = dict(zone_counts)
    for zone, record in LIVE_COUNTS.items():
        if zone not in KNOWN_ZONES:
            logger.warning("Ignoring unknown zone override: %s", zone)
            continue
        merged[zone] = int(record["count"])
    return merged


def clear_stale_overrides(max_age_seconds: int = 30) -> None:
    now = time.time()
    stale = [zone for zone, record in LIVE_COUNTS.items() if now - float(record["timestamp"]) > max_age_seconds]
    for zone in stale:
        LIVE_COUNTS.pop(zone, None)


def status_payload() -> List[dict]:
    now = time.time()
    return [
        {
            "zone": zone,
            "count": int(record["count"]),
            "source": str(record["source"]),
            "age_seconds": round(now - float(record["timestamp"]), 1),
        }
        for zone, record in LIVE_COUNTS.items()
    ]
