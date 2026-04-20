import time
from dataclasses import dataclass, asdict
from typing import List, Optional
from uuid import uuid4


@dataclass
class Alert:
    alert_id: str
    zone: str
    severity: str
    message: str
    created_at: float
    acknowledged: bool = False
    acknowledged_by: str = ""
    acknowledged_at: float = 0.0
    resolved: bool = False


STAFF_ALERTS: List[Alert] = []


def create_alert(zone: str, severity: str, message: str) -> Alert:
    for alert in STAFF_ALERTS:
        if not alert.resolved and alert.zone == zone and alert.severity == severity:
            return alert

    alert = Alert(
        alert_id=str(uuid4()),
        zone=zone,
        severity=severity,
        message=message,
        created_at=time.time(),
    )
    STAFF_ALERTS.append(alert)
    return alert


def acknowledge_alert(alert_id: str, staff_name: str) -> Optional[Alert]:
    for alert in STAFF_ALERTS:
        if alert.alert_id == alert_id and not alert.resolved:
            alert.acknowledged = True
            alert.acknowledged_by = staff_name
            alert.acknowledged_at = time.time()
            return alert
    return None


def resolve_alert(alert_id: str) -> Optional[Alert]:
    for alert in STAFF_ALERTS:
        if alert.alert_id == alert_id:
            alert.resolved = True
            return alert
    return None


def get_active_alerts() -> List[Alert]:
    return [alert for alert in STAFF_ALERTS if not alert.resolved]


def get_escalated_alerts(escalation_seconds: int = 120) -> List[Alert]:
    now = time.time()
    return [
        alert
        for alert in STAFF_ALERTS
        if alert.severity == "RED"
        and not alert.resolved
        and not alert.acknowledged
        and (now - alert.created_at) >= escalation_seconds
    ]
