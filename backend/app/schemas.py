from datetime import date
from typing import Optional

from pydantic import BaseModel, Field, model_validator

MAX_DAYS = 14


class TripRequest(BaseModel):
    destination: str = Field(min_length=2, max_length=120)
    start_date: date
    end_date: date
    budget: float = Field(gt=0, description="Total budget for the whole group")
    currency: str = Field(default="INR", min_length=3, max_length=3)
    group_size: int = Field(default=1, ge=1, le=50)
    travel_style: str = Field(default="balanced", pattern="^(budget|balanced|luxury)$")
    pace: str = Field(default="moderate", pattern="^(relaxed|moderate|fast)$")
    interests: list[str] = Field(default_factory=list, max_length=12)
    notes: str = Field(default="", max_length=500)

    @model_validator(mode="after")
    def check_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        if (self.end_date - self.start_date).days + 1 > MAX_DAYS:
            raise ValueError(f"Trips can be at most {MAX_DAYS} days long")
        return self

    @property
    def num_days(self) -> int:
        return (self.end_date - self.start_date).days + 1


class UpdateTrip(BaseModel):
    title: Optional[str] = Field(default=None, max_length=160)
    itinerary: Optional[dict] = None


class RefineRequest(BaseModel):
    instruction: str = Field(min_length=3, max_length=400)


class RegenerateDay(BaseModel):
    day: int = Field(ge=1)
    instruction: str = Field(default="", max_length=300)

