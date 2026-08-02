from abc import ABC, abstractmethod
from dataclasses import dataclass

from PIL import Image


@dataclass(frozen=True)
class Detection:
    category: str | None
    confidence: float
    bbox: tuple[float, float, float, float] | None  # normalized 0-1
    model_version: str
    label: str | None = None


class Classifier(ABC):
    @abstractmethod
    def classify(self, image: Image.Image) -> Detection: ...

    @property
    def model_loaded(self) -> bool:
        return False
