import random
from collections import deque
from dataclasses import dataclass, asdict
from typing import Deque, Dict, List, Optional, Tuple

GRID_WIDTH = 40
GRID_HEIGHT = 24
PHASES = ("ENTRY", "MID_GAME", "HALFTIME", "EXIT")

@dataclass
class User:
    user_id: int
    x: int
    y: int
    state: str
    target_zone: str

class CrowdSimulation:
    """High-fidelity grid crowd simulation with intent-driven agents and bottleneck physics."""

    def __init__(
        self,
        user_count: int = 400,
        seed: int = 42,
        zones: Optional[Dict[str, List[int]]] = None,
        grid_width: int = GRID_WIDTH,
        grid_height: int = GRID_HEIGHT,
    ) -> None:
        self.rng = random.Random(seed)
        self.user_count = max(1, user_count)
        self.users: List[User] = []
        self.phase = "ENTRY"
        self.auto_phase = False
        self.tick_count = 0
        self.grid_width = grid_width
        self.grid_height = grid_height
        self.history: Deque[Dict[str, object]] = deque(maxlen=50)
        self.sensor_feed: Dict[str, Dict[str, object]] = {}
        self.event_log: Deque[Dict[str, object]] = deque(maxlen=25)
        default_zones: Dict[str, Tuple[int, int, int, int]] = {
            "Gate A": (1, 2, 6, 7),
            "Gate B": (10, 2, 15, 7),
            "Gate C": (20, 2, 25, 7),
            "Gate D": (30, 2, 36, 7),
            "Food Court": (13, 14, 27, 20),
            "Exit": (17, 21, 23, 23),
            "Seating": (1, 8, 38, 12), # Added a large seating zone for logic
        }
        self.zones: Dict[str, Tuple[int, int, int, int]] = (
            {name: tuple(bounds) for name, bounds in zones.items()} if zones else default_zones
        )
        self.gate_names = [name for name in self.zones.keys() if name.lower().startswith("gate")]
        self.food_zone_name = next((name for name in self.zones.keys() if "food" in name.lower() or "concession" in name.lower()), "Food Court")
        self.exit_zone_name = next((name for name in self.zones.keys() if name.lower() == "exit"), "Exit")
        self.seating_zone_name = next((name for name in self.zones.keys() if "seating" in name.lower()), "Seating")
        self.grid_occupancy = [[0 for _ in range(self.grid_width)] for _ in range(self.grid_height)]
        self._init_users()

    def _reset_occupancy(self) -> None:
        self.grid_occupancy = [[0 for _ in range(self.grid_width)] for _ in range(self.grid_height)]
        for user in self.users:
            self.grid_occupancy[user.y][user.x] += 1

    def set_phase(self, phase: str) -> str:
        normalized = phase.strip().upper().replace("-", "_")
        if normalized not in PHASES:
            raise ValueError(f"Unsupported phase: {phase}")
        self.phase = normalized
        self._update_agent_intents()
        return self.phase

    def set_auto_phase(self, enabled: bool) -> bool:
        self.auto_phase = bool(enabled)
        return self.auto_phase

    def ingest_observation(self, zone: str, count: int, source: str = "camera_feed") -> Dict[str, object]:
        if zone not in self.zones:
            raise ValueError(f"Unsupported zone: {zone}")

        normalized_count = max(0, int(count))
        observation = {
            "zone": zone,
            "count": normalized_count,
            "source": source,
            "tick": self.tick_count,
        }
        self.sensor_feed[zone] = observation
        self.event_log.append({"type": "ingest", **observation})
        return observation

    def ingest_batch(self, payload: List[Dict[str, object]], default_source: str = "manual_staff") -> List[Dict[str, object]]:
        accepted: List[Dict[str, object]] = []
        for record in payload:
            zone = str(record.get("zone", "")).strip()
            if not zone:
                continue
            count = int(record.get("count", 0))
            source = str(record.get("source", default_source)) if record.get("source") else default_source
            accepted.append(self.ingest_observation(zone, count, source))
        return accepted

    def _init_users(self) -> None:
        self.users = []
        if not self.gate_names:
            self.gate_names = [name for name in self.zones.keys() if name != self.seating_zone_name]
        for i in range(self.user_count):
            gate = self.rng.choice(self.gate_names)
            zone = self.zones[gate]
            x = self.rng.randint(zone[0], zone[2])
            y = self.rng.randint(zone[1], zone[3])
            # Initially all entering and going to seats
            self.users.append(User(user_id=i + 1, x=x, y=y, state="entering", target_zone=self.seating_zone_name))
            self.grid_occupancy[y][x] += 1

    def _update_agent_intents(self) -> None:
        """Update agent targets based on the new phase."""
        for u in self.users:
            if self.phase == "ENTRY":
                if u.state not in ["idle"]:
                    u.target_zone = self.seating_zone_name
                    u.state = "walking_to_seat"
            elif self.phase == "MID_GAME":
                # Most people sit, a few go to food
                if self.rng.random() < 0.15:
                    u.target_zone = self.food_zone_name
                    u.state = "going_to_food"
                else:
                    u.target_zone = self.seating_zone_name
                    u.state = "walking_to_seat"
            elif self.phase == "HALFTIME":
                # Massive surge to food
                if self.rng.random() < 0.70:
                    u.target_zone = self.food_zone_name
                    u.state = "going_to_food"
                else:
                    u.target_zone = self.seating_zone_name
                    u.state = "idle"
            elif self.phase == "EXIT":
                u.target_zone = self.exit_zone_name
                u.state = "exiting"

    def detect_phase(self) -> str:
        counts = self.fused_zone_counts()
        gate_total = sum(counts.get(gate, 0) for gate in self.gate_names)
        food = counts.get("Food Court", 0)
        exit_count = counts.get("Exit", 0)
        total = max(1, sum(counts.get(zone, 0) for zone in ("Gate A", "Gate B", "Gate C", "Gate D", "Food Court", "Exit")))

        if exit_count >= max(food, gate_total) and exit_count / total >= 0.25:
            return "EXIT"
        if food >= max(exit_count, gate_total) and food / total >= 0.22:
            return "HALFTIME"
        if gate_total / total >= 0.55:
            return "ENTRY"
        return "MID_GAME"

    def _get_target_center(self, zone_name: str) -> Tuple[int, int]:
        z = self.zones.get(zone_name, self.zones["Seating"])
        return ((z[0] + z[2]) // 2, (z[1] + z[3]) // 2)

    def _is_in_zone(self, u: User, zone_name: str) -> bool:
        z = self.zones.get(zone_name)
        if not z: return False
        return z[0] <= u.x <= z[2] and z[1] <= u.y <= z[3]

    def _step_user(self, u: User) -> None:
        if u.state == "idle":
            # Very small chance to jiggle while idle
            if self.rng.random() > 0.1:
                return

        # Check if arrived at target
        if self._is_in_zone(u, u.target_zone):
            if u.target_zone == self.seating_zone_name:
                u.state = "idle"
            # If at food court, they might stay a while then go back to seating (unless halftime)
            elif u.target_zone == self.food_zone_name and self.phase != "HALFTIME":
                if self.rng.random() < 0.05:
                    u.target_zone = self.seating_zone_name
                    u.state = "walking_to_seat"
            
            # If at exit during EXIT phase, they just cluster there.
            if u.state == "idle":
                return

        tx, ty = self._get_target_center(u.target_zone)
        
        # Add some noise to target to spread them out within the zone
        tx += self.rng.randint(-2, 2)
        ty += self.rng.randint(-2, 2)

        # Determine desired direction
        dx = 1 if tx > u.x else -1 if tx < u.x else 0
        dy = 1 if ty > u.y else -1 if ty < u.y else 0

        # Sometimes agents don't move optimally
        if self.rng.random() < 0.2:
            dx = self.rng.choice([-1, 0, 1])
            dy = self.rng.choice([-1, 0, 1])

        nx = min(max(0, u.x + dx), self.grid_width - 1)
        ny = min(max(0, u.y + dy), self.grid_height - 1)
        nx = min(max(0, nx), self.grid_width - 1)

        if nx == u.x and ny == u.y:
            return

        # Bottleneck physics: cell capacity
        cell_density = self.grid_occupancy[ny][nx]
        move_probability = 1.0
        
        if cell_density >= 3:
            # Exponentially slower as it gets more crowded
            move_probability = 0.15 / (cell_density - 1)
        elif cell_density == 2:
            move_probability = 0.6

        if self.rng.random() < move_probability:
            # Move successful
            self.grid_occupancy[u.y][u.x] -= 1
            u.x, u.y = nx, ny
            self.grid_occupancy[u.y][u.x] += 1

    def fused_zone_counts(self) -> Dict[str, int]:
        simulated = self.zone_counts()
        fused = dict(simulated)

        for zone, record in self.sensor_feed.items():
            sensor_count = int(record.get("count", 0))
            simulated_count = simulated.get(zone, 0)
            fused[zone] = int(round(simulated_count * 0.7 + sensor_count * 0.3))

        return fused

    def tick(self) -> Dict[str, object]:
        self.tick_count += 1
        self._reset_occupancy()

        if self.auto_phase:
            detected_phase = self.detect_phase()
            if detected_phase != self.phase:
                self.phase = detected_phase
                self._update_agent_intents()

        for user in self.users:
            self._step_user(user)

        counts = self.fused_zone_counts()
        heat = self.heatmap()
        self.history.append(
            {
                "tick": self.tick_count,
                "phase": self.phase,
                "counts": counts,
                "max_density": heat["max_density"],
            }
        )
        self.event_log.append({"type": "tick", "tick": self.tick_count, "phase": self.phase})

        return {
            "grid": {"width": self.grid_width, "height": self.grid_height},
            "users": [asdict(u) for u in self.users],
            "zones": self.zones,
            "phase": self.phase,
            "tick": self.tick_count,
            "phases": list(PHASES),
            "auto_phase": self.auto_phase,
            "sensor_sources": list(self.sensor_feed.values()),
            "history_size": len(self.history),
        }

    def heatmap(self) -> Dict[str, object]:
        max_cell = max(max(row) for row in self.grid_occupancy) if self.grid_occupancy else 0
        return {
            "grid": {"width": self.grid_width, "height": self.grid_height},
            "density": self.grid_occupancy,
            "max_density": max_cell,
            "zones": self.zones,
            "phase": self.phase,
        }

    def zone_counts(self) -> Dict[str, int]:
        counts = {zone_name: 0 for zone_name in self.zones.keys()}
        for user in self.users:
            for zone_name, (x1, y1, x2, y2) in self.zones.items():
                if x1 <= user.x <= x2 and y1 <= user.y <= y2:
                    counts[zone_name] += 1
        return counts
