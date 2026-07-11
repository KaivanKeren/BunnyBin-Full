from abc import ABC, abstractmethod
from dataclasses import dataclass

from PIL import Image


@dataclass(frozen=True)
class Detection:
    category: str | None
    confidence: float
    bbox: tuple[int, int, int, int] | None
    model_version: str


class Classifier(ABC):
    @abstractmethod
    def classify(self, image: Image.Image) -> Detection: ...

    @property
    def model_loaded(self) -> bool:
        return False
