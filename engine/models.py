"""Versioned local scene contract. Coordinates are normalized to plot dimensions."""

import hashlib
import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from shapely.geometry import Point, Polygon


class Scene(BaseModel):
    model_config = ConfigDict(
        extra="forbid", allow_inf_nan=False, validate_default=True
    )
    version: Literal[1] = 1
    name: str = Field(default="Azure Terraces", min_length=1, max_length=60)
    width: float = Field(default=120, ge=30, le=200)
    depth: float = Field(default=70, ge=25, le=150)
    rise: float = Field(default=32, ge=0, le=70)
    terraces: int = Field(default=5, ge=2, le=8)
    spacing: float = Field(default=6, ge=4, le=12)
    row_spacing: float = Field(default=8, ge=5, le=15)
    boundary: list[tuple[float, float]] = Field(
        default_factory=lambda: [
            (0.08, 0.08),
            (0.78, 0.04),
            (0.96, 0.45),
            (0.87, 0.91),
            (0.13, 0.86),
        ],
        min_length=3,
        max_length=30,
    )
    source: tuple[float, float] = (0.15, 0.16)
    exclusions: list[list[tuple[float, float]]] = Field(
        default_factory=list, max_length=8
    )
    budget: float = Field(default=22000, ge=100, le=100000)
    min_pressure: float = Field(default=0.24, ge=0.1, le=0.6)
    max_pressure: float = Field(default=0.95, ge=0.2, le=1.1)
    source_lpm: float = Field(default=220, ge=5, le=500)
    volume_l: float = Field(default=4, ge=1, le=10)
    seed: int = Field(default=42, ge=0, le=2147483647)

    @model_validator(mode="after")
    def valid_geometry(self):
        coordinates = (
            self.boundary
            + [self.source]
            + [p for ring in self.exclusions for p in ring]
        )
        if any(not (0 <= x <= 1 and 0 <= y <= 1) for x, y in coordinates):
            raise ValueError("Coordinates must be inside the plot canvas")
        p = Polygon(self.boundary)
        if not p.is_valid or p.area < 0.05:
            raise ValueError(
                "The boundary intersects itself or is too small; adjust its vertices"
            )
        if not p.covers(Point(self.source)):
            raise ValueError("Place the water source inside the plot boundary")
        for ring in self.exclusions:
            if not 3 <= len(ring) <= 20:
                raise ValueError("Exclusions require 3–20 vertices")
            exclusion = Polygon(ring)
            if not exclusion.is_valid or exclusion.area < 0.0001:
                raise ValueError("Invalid exclusion geometry")
            if exclusion.covers(Point(self.source)):
                raise ValueError("The water source cannot be inside an exclusion")
        if self.min_pressure >= self.max_pressure:
            raise ValueError("Minimum pressure must be below maximum pressure")
        if self.width * self.depth / (self.spacing * self.row_spacing) > 500:
            raise ValueError(
                "The local version supports up to 500 planting nodes; increase spacing"
            )
        return self

    def revision(self):
        return hashlib.sha256(
            json.dumps(self.model_dump(), sort_keys=True).encode()
        ).hexdigest()[:16]
