"""Request / response contracts. Validation happens here, before any
analytics code runs, so the API returns precise 422 errors for bad input."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

MAX_VALUES = 200_000
MAX_TEXT = 500_000


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    created_at: datetime


class _NumericInput(BaseModel):
    values: list[float] | None = Field(default=None, max_length=MAX_VALUES)
    text: str | None = Field(default=None, max_length=MAX_TEXT)

    @model_validator(mode="after")
    def _exactly_one_source(self):
        if (self.values is None) == (self.text is None):
            raise ValueError("Provide exactly one of 'values' or 'text'.")
        return self

    @field_validator("values")
    @classmethod
    def _finite(cls, v):
        if v is not None and any(x != x or x in (float("inf"), float("-inf")) for x in v):
            raise ValueError("values must be finite numbers")
        return v


class BenfordParams(_NumericInput):
    kind: Literal["benford"] = "benford"
    digits: Literal[1, 2] = 1


class AnomalyParams(_NumericInput):
    kind: Literal["anomalies"] = "anomalies"
    z_threshold: float = Field(default=3.5, ge=2.0, le=10.0)


class MdnaParams(BaseModel):
    kind: Literal["mdna_diff"] = "mdna_diff"
    before: str = Field(min_length=1, max_length=MAX_TEXT)
    after: str = Field(min_length=1, max_length=MAX_TEXT)
    similarity_threshold: float = Field(default=0.6, gt=0.2, lt=0.99)


AnalysisParams = Annotated[Union[BenfordParams, AnomalyParams, MdnaParams], Field(discriminator="kind")]


class AnalysisCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    params: AnalysisParams


class VersionCreate(BaseModel):
    params: AnalysisParams


class VersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    version: int
    method_version: str
    input_sha256: str
    params: dict
    result: dict
    created_at: datetime


class VersionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    version: int
    method_version: str
    input_sha256: str
    created_at: datetime


class AnalysisOut(BaseModel):
    id: int
    kind: str
    title: str
    created_at: datetime
    updated_at: datetime
    versions: list[VersionSummary]
    latest: VersionOut


class AnalysisListItem(BaseModel):
    id: int
    kind: str
    title: str
    updated_at: datetime
    latest_version: int


class Page(BaseModel):
    items: list[AnalysisListItem]
    total: int
    limit: int
    offset: int
