import time
from typing import Dict

FLASH_DEAL: Dict[str, object] = {
    "active": False,
    "discount_percent": 0,
    "zone": "Food Court",
    "created_at": 0.0,
    "expires_at": 0.0,
    "message": "No active flash deal",
    "triggered_by": "system",
}


def set_flash_deal(discount_percent: int, duration_minutes: int, zone: str = "Food Court", triggered_by: str = "operator") -> Dict[str, object]:
    now = time.time()
    safe_discount = max(5, min(70, int(discount_percent)))
    safe_duration = max(1, min(60, int(duration_minutes)))

    FLASH_DEAL.update(
        {
            "active": True,
            "discount_percent": safe_discount,
            "zone": zone,
            "created_at": now,
            "expires_at": now + (safe_duration * 60),
            "message": f"{safe_discount}% flash deal live at {zone}",
            "triggered_by": triggered_by,
        }
    )
    return get_flash_deal()


def clear_flash_deal() -> Dict[str, object]:
    FLASH_DEAL.update(
        {
            "active": False,
            "discount_percent": 0,
            "zone": FLASH_DEAL.get("zone", "Food Court"),
            "created_at": FLASH_DEAL.get("created_at", 0.0),
            "expires_at": 0.0,
            "message": "No active flash deal",
            "triggered_by": FLASH_DEAL.get("triggered_by", "system"),
        }
    )
    return get_flash_deal()


def get_flash_deal() -> Dict[str, object]:
    now = time.time()
    if FLASH_DEAL.get("active") and now >= float(FLASH_DEAL.get("expires_at", 0.0)):
        clear_flash_deal()

    remaining_seconds = max(0, int(float(FLASH_DEAL.get("expires_at", 0.0)) - now)) if FLASH_DEAL.get("active") else 0
    payload = dict(FLASH_DEAL)
    payload["remaining_seconds"] = remaining_seconds
    return payload
