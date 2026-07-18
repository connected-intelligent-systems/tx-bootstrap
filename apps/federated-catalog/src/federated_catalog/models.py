from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Any


def utc_now() -> datetime:
    return datetime.now(UTC)


def iso(value: datetime | None) -> str | None:
    return value.isoformat().replace("+00:00", "Z") if value else None


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


@dataclass(frozen=True)
class Participant:
    name: str
    bpn: str
    did: str
    dsp_endpoint: str

    def public_dict(self) -> dict[str, str]:
        return {
            "name": self.name,
            "bpn": self.bpn,
            "did": self.did,
            "dspEndpoint": self.dsp_endpoint,
        }


@dataclass
class CrawlStatus:
    participant: Participant
    state: str = "pending"
    dataset_count: int = 0
    last_attempt_at: str | None = None
    last_success_at: str | None = None
    inactive_since: str | None = None
    last_error: str | None = None
    active: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "participant": self.participant.public_dict(),
            "state": self.state,
            "datasetCount": self.dataset_count,
            "lastAttemptAt": self.last_attempt_at,
            "lastSuccessAt": self.last_success_at,
            "inactiveSince": self.inactive_since,
            "lastError": self.last_error,
            "active": self.active,
        }

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> CrawlStatus:
        participant = value["participant"]
        return cls(
            participant=Participant(
                name=participant["name"],
                bpn=participant["bpn"],
                did=participant["did"],
                dsp_endpoint=participant["dspEndpoint"],
            ),
            state=value.get("state", "pending"),
            dataset_count=int(value.get("datasetCount", 0)),
            last_attempt_at=value.get("lastAttemptAt"),
            last_success_at=value.get("lastSuccessAt"),
            inactive_since=value.get("inactiveSince"),
            last_error=value.get("lastError"),
            active=bool(value.get("active", True)),
        )


@dataclass(frozen=True)
class DatasetRecord:
    entry_id: str
    dataset_id: str
    participant: Participant
    crawled_at: str
    dataset: dict[str, Any]
    title: list[str]
    description: list[str]
    abstract: list[str]
    keywords: list[str]
    themes: list[str]
    content_types: list[str]

    def to_dict(self, *, stale: bool, participant: Participant | None = None) -> dict[str, Any]:
        current_participant = participant or self.participant
        return {
            "id": self.entry_id,
            "datasetId": self.dataset_id,
            "participant": current_participant.public_dict(),
            "counterPartyAddress": current_participant.dsp_endpoint,
            "counterPartyId": current_participant.did,
            "crawledAt": self.crawled_at,
            "stale": stale,
            "dataset": self.dataset,
        }

    def storage_dict(self) -> dict[str, Any]:
        value = asdict(self)
        value["participant"] = self.participant.public_dict()
        return value

    @classmethod
    def from_storage_dict(cls, value: dict[str, Any]) -> DatasetRecord:
        participant = value["participant"]
        return cls(
            entry_id=value["entry_id"],
            dataset_id=value["dataset_id"],
            participant=Participant(
                name=participant["name"],
                bpn=participant["bpn"],
                did=participant["did"],
                dsp_endpoint=participant["dspEndpoint"],
            ),
            crawled_at=value["crawled_at"],
            dataset=value["dataset"],
            title=list(value.get("title", [])),
            description=list(value.get("description", [])),
            abstract=list(value.get("abstract", [])),
            keywords=list(value.get("keywords", [])),
            themes=list(value.get("themes", [])),
            content_types=list(value.get("content_types", [])),
        )
